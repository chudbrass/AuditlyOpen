export function readinessStatus(databaseOk: boolean, workerOnline: boolean): 200 | 503 {
  return databaseOk && workerOnline ? 200 : 503;
}
