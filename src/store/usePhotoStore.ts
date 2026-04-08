"use client";

import { create } from "zustand";
import { CapturedPhoto } from "@/types";

interface PhotoStore {
  capturedPhotos: CapturedPhoto[];
  selectedPhotoId: string | null;
  addPhoto: (photo: CapturedPhoto) => void;
  removePhoto: (id: string) => void;
  selectPhoto: (id: string | null) => void;
  clearPhotos: () => void;
}

export const usePhotoStore = create<PhotoStore>((set) => ({
  capturedPhotos: [],
  selectedPhotoId: null,
  addPhoto: (photo) =>
    set((state) => ({
      capturedPhotos: [...state.capturedPhotos, photo],
    })),
  removePhoto: (id) =>
    set((state) => ({
      capturedPhotos: state.capturedPhotos.filter((p) => p.id !== id),
      selectedPhotoId: state.selectedPhotoId === id ? null : state.selectedPhotoId,
    })),
  selectPhoto: (id) => set({ selectedPhotoId: id }),
  clearPhotos: () => set({ capturedPhotos: [], selectedPhotoId: null }),
}));
