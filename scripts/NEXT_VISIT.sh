#!/usr/bin/env bash
# THE LAST TRIP. Run this once, on campus, as the FIRST thing you do.
#
#     ./scripts/NEXT_VISIT.sh
#
# Its job is not to run benchmarks. Its job is to make the 100km trips stop.
#
# WHY THIS IS THE PRIORITY. Five campus visits have been spent because the box
# sits on a private 10.x address that is unreachable from anywhere else. Every
# mistake -- a wrong model, a bad concurrency, a stale checkpoint -- costs a
# 200km round trip to correct, and a mistake is always found eventually. No
# amount of careful tuning fixes that; remote access does. Ten minutes here
# plausibly buys back every future trip.
#
# HOW. Tailscale has a userspace mode that needs NO root and NO admin: it does
# its own networking instead of asking the kernel for a TUN device. We already
# know userspace daemons work on this box, because that is exactly how Ollama
# is installed there. If that path is blocked, the script falls back to a
# reverse SSH tunnel through any host you can already reach.
#
# Afterwards you SSH in from your desk, and the pipeline becomes something you
# supervise rather than something you drive to.

cd "$(dirname "$0")/.." || exit 1
set -u

if [ -z "${THIRDEYE_DGX_HOST:-}" ] && [ -f .dgx_host ]; then
  . ./.dgx_host; export THIRDEYE_DGX_HOST
fi
BOX="${THIRDEYE_DGX_HOST:?set THIRDEYE_DGX_HOST=user@host}"

say() { printf '\n=== %s\n' "$*"; }

say "1. reachable?"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$BOX" 'echo ok' >/dev/null 2>&1 || {
  echo "CANNOT REACH $BOX -- are you on the campus network?"; exit 1; }
echo "   yes"

say "2. does the box have outbound internet?"
# Everything below depends on this. If the box cannot reach the internet,
# Tailscale cannot work and the reverse-tunnel fallback is the only option.
if ssh "$BOX" 'curl -fsS --max-time 10 https://pkgs.tailscale.com/ >/dev/null 2>&1'; then
  echo "   yes -- Tailscale is available"
  NET=ok
else
  echo "   NO outbound internet. Skipping to the reverse-tunnel fallback."
  NET=no
fi

if [ "$NET" = ok ]; then
  say "3. install Tailscale in userspace (no root)"
  ssh "$BOX" 'bash -s' <<'REMOTE'
set -e
mkdir -p ~/.local/bin ~/.tailscale
if [ ! -x ~/.local/bin/tailscaled ]; then
  ARCH=$(uname -m)
  case "$ARCH" in
    aarch64|arm64) TS_ARCH=arm64 ;;
    x86_64)        TS_ARCH=amd64 ;;
    *) echo "unsupported arch $ARCH"; exit 1 ;;
  esac
  VER=$(curl -fsSL https://pkgs.tailscale.com/stable/?mode=json | grep -o '"TarballsVersion":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ -n "$VER" ] || VER=1.78.1
  URL="https://pkgs.tailscale.com/stable/tailscale_${VER}_${TS_ARCH}.tgz"
  echo "   downloading $URL"
  curl -fsSL "$URL" -o /tmp/ts.tgz
  tar xzf /tmp/ts.tgz -C /tmp
  cp /tmp/tailscale_${VER}_${TS_ARCH}/tailscale /tmp/tailscale_${VER}_${TS_ARCH}/tailscaled ~/.local/bin/
  chmod +x ~/.local/bin/tailscale ~/.local/bin/tailscaled
fi
echo "   installed: $(~/.local/bin/tailscale version | head -1)"

# Userspace networking: no TUN device, so no root. SSH into this node still
# works because Tailscale accepts inbound connections and forwards them to
# localhost:22 itself.
pgrep -f 'tailscaled.*userspace' >/dev/null || {
  setsid nohup ~/.local/bin/tailscaled \
      --tun=userspace-networking \
      --socket=$HOME/.tailscale/tailscaled.sock \
      --statedir=$HOME/.tailscale/state \
      > ~/tailscaled.log 2>&1 < /dev/null &
  disown
  sleep 3
}
echo "   daemon running"
REMOTE

  say "4. authenticate -- OPEN THE URL BELOW AND LOG IN"
  echo "   (this is the only interactive step; it binds the box to YOUR tailnet)"
  ssh -t "$BOX" '~/.local/bin/tailscale --socket=$HOME/.tailscale/tailscaled.sock up --ssh --hostname=thirdeye-gb10 2>&1 | head -20'

  say "5. the address to use from home"
  ssh "$BOX" '~/.local/bin/tailscale --socket=$HOME/.tailscale/tailscaled.sock ip -4 2>/dev/null; echo; echo "   hostname: thirdeye-gb10"'
  cat <<'EOF'

   Install Tailscale on the laptop, log in with the SAME account, then:

       echo "THIRDEYE_DGX_HOST=<user>@thirdeye-gb10" > .dgx_host

   Verify it NOW, before leaving campus, by turning campus wifi OFF and
   using a phone hotspot:

       ssh <user>@thirdeye-gb10 'echo IT WORKS'

   If that succeeds from the hotspot, you never need to drive here again
   for a run. Do not leave until you have seen it succeed.
EOF
else
  cat <<'EOF'

   FALLBACK -- reverse tunnel. Needs any always-on host you can already
   reach from home (a VPS, a home server with port forwarding).

   On the box, with YOUR_VPS filled in:

       ssh -f -N -R 2222:localhost:22 user@YOUR_VPS

   Then from home:

       ssh -p 2222 student-9@YOUR_VPS

   Make it survive drops by installing autossh, or add to the box's crontab:

       @reboot ssh -f -N -R 2222:localhost:22 user@YOUR_VPS

   If you have no such host, the remaining option is asking the department
   for VPN access to the lab subnet -- worth one email, given what the trips
   cost.
EOF
fi

say "6. pipeline state"
ssh "$BOX" 'cd ~/thirdeye/backend && ~/thirdeye/venv/bin/python eval/progress.py 2>&1 | head -14'

cat <<'EOF'

NEXT, once remote access is verified working:
  relaunch   ssh $THIRDEYE_DGX_HOST 'cd ~/thirdeye && SKIP_CALIBRATE=1 CONC=6 \
               STAGES="a1 a2 a3 baselines ablation arb web3" \
               setsid nohup bash scripts/run_all.sh > ~/run_all.log 2>&1 &'
  status     ssh $THIRDEYE_DGX_HOST 'cd ~/thirdeye/backend && python3 eval/progress.py'
  collect    ./scripts/TUESDAY_FETCH.sh     (no longer trip-critical)
EOF
