import crypto from "crypto";

const pendingActions = new Map();
const EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Creates and stores a pending action server-side
 */
export const createPendingAction = ({
  userId,
  tool,
  args,
  summary,
  metadata = {},
}) => {
  const id = `act_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const action = {
    id,
    userId: String(userId),
    tool,
    args,
    summary,
    metadata,
    createdAt: Date.now(),
    expiresAt: Date.now() + EXPIRY_MS,
  };
  pendingActions.set(id, action);
  return action;
};

/**
 * Retrieves a valid, non-expired pending action
 */
export const getPendingAction = (id) => {
  const action = pendingActions.get(id);
  if (!action) return null;
  if (Date.now() > action.expiresAt) {
    pendingActions.delete(id);
    return null;
  }
  return action;
};

/**
 * Discards/removes a pending action
 */
export const removePendingAction = (id) => {
  return pendingActions.delete(id);
};

// Periodic garbage collection for expired pending actions
setInterval(() => {
  const now = Date.now();
  for (const [id, act] of pendingActions.entries()) {
    if (now > act.expiresAt) {
      pendingActions.delete(id);
    }
  }
}, 60 * 1000);
