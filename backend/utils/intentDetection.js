// utils/intentDetection.js

export const detectIntent = (text = "") => {
  const t = text.toLowerCase();

  if (
    t.includes("fee") ||
    t.includes("price") ||
    t.includes("cost") ||
    t.includes("join") ||
    t.includes("enroll")
  ) {
    return "high";
  }

  if (
    t.includes("maybe") ||
    t.includes("call later") ||
    t.includes("interested")
  ) {
    return "medium";
  }

  return "low";
};
