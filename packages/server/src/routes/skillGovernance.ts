import {
  API_PREFIX,
  apiPaths,
  governanceDetailResponseSchema,
  skillReleaseCreateBodySchema,
  skillReviewCreateBodySchema,
} from "@agentic/shared";
import type { MiddlewareHandler } from "hono";
import type { Hono } from "hono";
import type { AppEnv } from "../appEnv.js";
import {
  addSkillRelease,
  addSkillReview,
  createPolicyHitsForSkill,
  getGovernanceDetail,
  getSkillRecord,
  updateSkillRecordStatus,
} from "../store.js";

export function registerSkillGovernanceRoutes(app: Hono<AppEnv>, auth: MiddlewareHandler): void {
  app.get(`${API_PREFIX}/skills/:id/governance`, auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const skill = getSkillRecord(c.get("db"), id);
    if (!skill) {
      return c.json({ error: "not_found" }, 404);
    }
    createPolicyHitsForSkill(c.get("db"), id, { runId: skill.runId });
    const detail = getGovernanceDetail(c.get("db"), id);
    const payload = governanceDetailResponseSchema.parse(detail);
    return c.json(payload);
  });

  app.post(`${API_PREFIX}/skills/:id/review`, auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = skillReviewCreateBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const skill = getSkillRecord(c.get("db"), id);
    if (!skill) {
      return c.json({ error: "not_found" }, 404);
    }
    const { id: reviewId } = addSkillReview(c.get("db"), {
      skillRecordId: id,
      reviewer: parsed.data.reviewer,
      decision: parsed.data.decision,
      reason: parsed.data.reason,
    });
    if (parsed.data.decision === "approved") {
      updateSkillRecordStatus(c.get("db"), id, "accepted");
    }
    return c.json({ ok: true, reviewId }, 201);
  });

  app.post(`${API_PREFIX}/skills/:id/release`, auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ error: "invalid_id" }, 400);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = skillReleaseCreateBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const skill = getSkillRecord(c.get("db"), id);
    if (!skill) {
      return c.json({ error: "not_found" }, 404);
    }
    const detail = getGovernanceDetail(c.get("db"), id);
    if (detail.gateDecision === "deny") {
      return c.json({ error: "release_denied", message: "当前策略门禁不允许发布" }, 422);
    }
    if (skill.status !== "accepted") {
      return c.json({ error: "release_requires_accepted", message: "请先审核通过 skill" }, 422);
    }
    const { id: releaseId } = addSkillRelease(c.get("db"), {
      skillRecordId: id,
      channel: parsed.data.channel,
      status: "released",
      approvedBy: parsed.data.approvedBy,
    });
    return c.json({ ok: true, releaseId }, 201);
  });
}
