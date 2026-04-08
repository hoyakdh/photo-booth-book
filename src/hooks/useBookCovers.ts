"use client";

import { useState, useEffect, useCallback } from "react";
import { BookCover } from "@/types";
import { getAllBookCovers, saveBookCover, deleteBookCover, getBookCover } from "@/lib/db";

export function useBookCovers() {
  const [covers, setCovers] = useState<BookCover[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCovers = useCallback(async () => {
    try {
      const data = await getAllBookCovers();
      setCovers(data);
    } catch (err) {
      console.error("Failed to load book covers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCovers();
  }, [loadCovers]);

  const addCover = async (cover: BookCover) => {
    await saveBookCover(cover);
    await loadCovers();
  };

  const removeCover = async (id: string) => {
    await deleteBookCover(id);
    await loadCovers();
  };

  const updateCover = async (cover: BookCover) => {
    await saveBookCover(cover);
    await loadCovers();
  };

  return { covers, loading, addCover, removeCover, updateCover };
}

export function useBookCover(id: string) {
  const [cover, setCover] = useState<BookCover | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBookCover(id)
      .then((data) => setCover(data ?? null))
      .catch(() => setCover(null))
      .finally(() => setLoading(false));
  }, [id]);

  return { cover, loading };
}
