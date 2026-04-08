"use client";

import { create } from "zustand";
import { CapturedPhoto } from "@/types";

interface PhotoStore {
  capturedPhotos: CapturedPhoto[];
  selectedPhotoId: string | null;
  gifFrames: HTMLCanvasElement[];
  addPhoto: (photo: CapturedPhoto) => void;
  removePhoto: (id: string) => void;
  selectPhoto: (id: string | null) => void;
  setGifFrames: (frames: HTMLCanvasElement[]) => void;
  clearPhotos: () => void;
}

export const usePhotoStore = create<PhotoStore>((set) => ({
  capturedPhotos: [],
  selectedPhotoId: null,
  gifFrames: [],
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
  setGifFrames: (frames) => set({ gifFrames: frames }),
  clearPhotos: () => set({ capturedPhotos: [], selectedPhotoId: null, gifFrames: [] }),
}));
