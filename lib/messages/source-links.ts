export function messageElementId(messageId: string) {
  return `message-${messageId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

export function messageAuditHref(messageId: string) {
  const params = new URLSearchParams({
    view: "audit",
    auditView: "messages",
    message: messageId
  });

  return `?${params.toString()}`;
}
