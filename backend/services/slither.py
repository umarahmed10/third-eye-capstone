import subprocess, tempfile, os

def run_slither(code: str) -> dict:
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sol", delete=False) as f:
            f.write(code)
            p = f.name
        result = subprocess.run(["slither", p, "--json", "-"], capture_output=True, text=True, timeout=30)
        os.unlink(p)
        return {"status": "completed", "output": result.stdout if result.returncode == 0 else result.stderr, "return_code": result.returncode}
    except FileNotFoundError:
        return {"status": "skipped", "message": "Slither not installed (optional)"}
    except subprocess.TimeoutExpired:
        return {"status": "error", "message": "Slither timed out"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
