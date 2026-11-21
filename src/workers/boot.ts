process.env.AUDITLY_PROCESS_ROLE = "worker";

void import("./index").catch((error) => {
  console.error("worker module failed to load", error);
  process.exit(1);
});
