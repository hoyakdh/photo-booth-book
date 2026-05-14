/** 앱 최초 접속 시 IndexedDB에 넣을 정적 표지 (public/ 경로 기준) */
export interface DefaultCoverConfig {
  name: string;
  imagePath: string;
  /** 크로마키 마스크(흰색=카메라 구멍). 없으면 원본만 저장 */
  maskPath?: string;
  /** 홈 썸네일용 크로마 미리보기. 없으면 imageData 사용 */
  previewPath?: string;
  order?: number;
}

/** 항목 추가 시 public/covers/에 PNG 등을 두고 경로를 맞춥니다. */
export const DEFAULT_COVERS: DefaultCoverConfig[] = [
  {
    name: "기본 책표지",
    imagePath: "/covers/default-cover.png",
    order: 0,
  },
];
