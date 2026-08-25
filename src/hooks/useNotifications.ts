import { useMemo } from "react";
import { storage } from "@/lib/storage";

export type NotificationLevel = "info" | "warning" | "error" | "success";

export interface AppNotification {
  id: string;
  level: NotificationLevel;
  title: string;
  body: string;
  time: string;
  read?: boolean;
}

export function useNotifications(): AppNotification[] {
  return useMemo(() => {
    const printers = storage.getPrinters();
    const jobs = storage.getJobs();
    const notes: AppNotification[] = [];
    const now = Date.now();

    // Offline printers
    printers.filter(p => p.status === "offline" || p.status === "error").forEach(p => {
      notes.push({
        id: `offline-${p.id}`,
        level: "error",
        title: "Printer offline",
        body: `${p.name} at ${p.branch} is unreachable.`,
        time: "now",
      });
    });

    // Low toner (< 25%)
    printers.filter(p => p.tonerLevel < 25).forEach(p => {
      notes.push({
        id: `toner-${p.id}`,
        level: "warning",
        title: "Low toner",
        body: `${p.name} toner at ${p.tonerLevel}% — order soon.`,
        time: "now",
      });
    });

    // Low paper (< 20%)
    printers.filter(p => p.paperLevel < 20).forEach(p => {
      notes.push({
        id: `paper-${p.id}`,
        level: "warning",
        title: "Low paper",
        body: `${p.name} paper tray below 20%.`,
        time: "now",
      });
    });

    // Jobs pending > 60 min
    const staleJobs = jobs.filter(j => {
      if (j.status !== "queued" && j.status !== "printing") return false;
      const elapsed = (now - new Date(j.submitted_at).getTime()) / 60000;
      return elapsed > 60;
    });
    if (staleJobs.length > 0) {
      notes.push({
        id: "stale-jobs",
        level: "warning",
        title: "Jobs awaiting release",
        body: `${staleJobs.length} job${staleJobs.length > 1 ? "s have" : " has"} been queued for over an hour.`,
        time: "now",
      });
    }

    // Recent completions (last 30 min)
    const recentDone = jobs.filter(j => {
      if (j.status !== "completed" || !j.released_at) return false;
      return (now - new Date(j.released_at).getTime()) < 30 * 60000;
    });
    if (recentDone.length > 0) {
      notes.push({
        id: "recent-done",
        level: "success",
        title: "Jobs completed",
        body: `${recentDone.length} job${recentDone.length > 1 ? "s" : ""} released in the last 30 minutes.`,
        time: "recently",
      });
    }

    // All good message when nothing else
    if (notes.length === 0) {
      notes.push({
        id: "all-ok",
        level: "info",
        title: "All systems normal",
        body: "No alerts — all printers online and queues clear.",
        time: "now",
      });
    }

    return notes;
  }, []);
}
