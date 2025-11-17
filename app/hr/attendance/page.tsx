function computeHours(logs: any[]) {
  let totalMs = 0;

  for (let i = 0; i < logs.length; i++) {
    if (logs[i].type === "login") {
      const logoutEvent = logs.find(
        (l: any) =>
          l.type === "logout" &&
          new Date(l.timestamp) > new Date(logs[i].timestamp)
      );

      if (logoutEvent) {
        const diff =
          new Date(logoutEvent.timestamp).getTime() -
          new Date(logs[i].timestamp).getTime();
        totalMs += diff;
      }
    }
  }

  const hrs = totalMs / (1000 * 60 * 60);
  return hrs.toFixed(2);
}
