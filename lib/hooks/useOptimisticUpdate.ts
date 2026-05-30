"use client";

import { useCallback, useRef } from "react";
import React from "react";
import toast from "react-hot-toast";
import { toastError, toastSuccess } from "@/lib/toast";

type UpdateOptions<T> = {
  optimisticData: T[];
  mutation: () => Promise<unknown>;
  rollbackData: T[];
  successMessage?: string;
  errorMessage?: string;
};

type DeleteOptions<T extends { id: string }> = {
  item: T;
  previousData: T[];
  optimisticData: T[];
  mutation: () => Promise<unknown>;
  restoreMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  undoWindowMs?: number;
};

export function useOptimisticUpdate<T extends { id: string }>(
  setItems: React.Dispatch<React.SetStateAction<T[]>>
) {
  const pendingDeleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingDeletedItems = useRef<Map<string, T>>(new Map());

  const executeOptimisticUpdate = useCallback(
    async ({
      optimisticData,
      mutation,
      rollbackData,
      successMessage = "Saved successfully.",
      errorMessage = "Unable to save changes.",
    }: UpdateOptions<T>) => {
      const previousSnapshot: T[] = rollbackData;
      setItems(optimisticData);

      try {
        await mutation();
        toastSuccess(successMessage);
      } catch (error) {
        setItems(previousSnapshot);
        toastError(errorMessage);
        throw error;
      }
    },
    [setItems]
  );

  const executeOptimisticDelete = useCallback(
    async ({
      item,
      previousData,
      optimisticData,
      mutation,
      restoreMessage = "Delete canceled.",
      successMessage = "Deleted successfully.",
      errorMessage = "Unable to delete item.",
      undoWindowMs = 5000,
    }: DeleteOptions<T>) => {
      const previousSnapshot = [...previousData];

      setItems(optimisticData);
      pendingDeletedItems.current.set(item.id, item);

      const undoDelete = () => {
        const timer = pendingDeleteTimers.current.get(item.id);
        if (timer) {
          clearTimeout(timer);
          pendingDeleteTimers.current.delete(item.id);
        }
        const deletedItem = pendingDeletedItems.current.get(item.id);
        if (!deletedItem) return;

        pendingDeletedItems.current.delete(item.id);
        setItems((current) => {
          const restored = [...current, deletedItem];
          return previousSnapshot.map((snapshotItem) => restored.find((entry) => entry.id === snapshotItem.id) || snapshotItem);
        });
        toastSuccess(restoreMessage);
      };

      const toastId = toast.custom((t) =>
        React.createElement(
          "div",
          {
            className:
              "flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900",
          },
          React.createElement("span", null, "Item removed."),
          React.createElement(
            "button",
            {
              type: "button",
              className: "font-semibold text-blue-600 dark:text-blue-400",
              onClick: () => {
                toast.dismiss(t.id);
                undoDelete();
              },
            },
            "Undo"
          )
        )
      );

      const timer = setTimeout(async () => {
        pendingDeleteTimers.current.delete(item.id);

        if (!pendingDeletedItems.current.has(item.id)) {
          toast.dismiss(toastId);
          return;
        }

        try {
          await mutation();
          pendingDeletedItems.current.delete(item.id);
          toast.dismiss(toastId);
          toastSuccess(successMessage);
        } catch {
          pendingDeletedItems.current.delete(item.id);
          setItems(previousSnapshot);
          toast.dismiss(toastId);
          toastError(errorMessage);
        }
      }, undoWindowMs);

      pendingDeleteTimers.current.set(item.id, timer);
    },
    [setItems]
  );

  return {
    executeOptimisticUpdate,
    executeOptimisticDelete,
  };
}
