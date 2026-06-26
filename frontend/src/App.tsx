import { useState } from "react";
import type { User } from "./lib/api";
import { Layout, type Tab } from "./components/Layout";
import { Login } from "./views/Login";
import { Analyze } from "./views/Analyze";
import { HowItWorks } from "./views/HowItWorks";
import { Benchmarks } from "./views/Benchmarks";
import { History } from "./views/History";

const STORAGE_KEY = "te_user";

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? (JSON.parse(s) as User) : null;
    } catch {
      return null;
    }
  });
  // Scan is the default landing.
  const [tab, setTab] = useState<Tab>("analyze");
  // Bump to force History to re-fetch sessions after a scan completes.
  const [scanNonce, setScanNonce] = useState(0);

  function onAuth(u: User) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
    setTab("analyze");
  }

  function onLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  if (!user) return <Login onAuth={onAuth} />;

  return (
    <Layout user={user} tab={tab} onTab={setTab} onLogout={onLogout}>
      {tab === "analyze" && (
        <Analyze
          user={user}
          onNavigate={setTab}
          onScanComplete={() => setScanNonce((n) => n + 1)}
        />
      )}
      {tab === "how" && <HowItWorks />}
      {tab === "benchmarks" && <Benchmarks />}
      {tab === "history" && <History key={`hist-${scanNonce}`} user={user} />}
    </Layout>
  );
}
