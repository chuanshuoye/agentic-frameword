import { NavLink, Route, Routes } from "react-router-dom";
import { RunDetailPage } from "./pages/RunDetailPage.js";
import { RunsPage } from "./pages/RunsPage.js";
import { SessionDetailPage } from "./pages/SessionDetailPage.js";
import { SessionsPage } from "./pages/SessionsPage.js";
import { SkillDetailPage } from "./pages/SkillDetailPage.js";
import { SkillEvolvePage } from "./pages/SkillEvolvePage.js";
import { SkillFeedbackPage } from "./pages/SkillFeedbackPage.js";
import { SkillGovernPage } from "./pages/SkillGovernPage.js";
import { SkillsPage } from "./pages/SkillsPage.js";

export function App() {
  const docsUrl = (import.meta.env.VITE_DOCS_URL as string | undefined) ?? "http://localhost:5174/";

  return (
    <div className="ui-shell">
      <header className="ui-topnav">
        <NavLink to="/" className="ui-brand" end>
          Agentic 观测
        </NavLink>
        <nav className="ui-nav" aria-label="主导航">
          <NavLink to="/" className={({ isActive }) => (isActive ? "ui-nav-active" : "")} end>
            Agent回溯
          </NavLink>
          <NavLink to="/sessions" className={({ isActive }) => (isActive ? "ui-nav-active" : "")}>
            Agent会话
          </NavLink>
          <NavLink to="/skills" className={({ isActive }) => (isActive ? "ui-nav-active" : "")}>
            Skill 库
          </NavLink>
        </nav>
        <a className="ui-muted" style={{ marginLeft: "auto" }} href={docsUrl} target="_blank" rel="noreferrer">
          Doc 文档站点入口
        </a>
      </header>
      <main className="ui-main">
        <Routes>
          <Route path="/" element={<RunsPage />} />
          <Route path="/runs/:runId" element={<RunDetailPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/skills/:skillId" element={<SkillDetailPage />} />
          <Route path="/skills/:skillId/govern" element={<SkillGovernPage />} />
          <Route path="/skills/:skillId/evolve" element={<SkillEvolvePage />} />
          <Route path="/skills/:skillId/feedback" element={<SkillFeedbackPage />} />
        </Routes>
      </main>
    </div>
  );
}
