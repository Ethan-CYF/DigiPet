/** Future upload/crop/auto-animation pipeline. No files are read or uploaded in M0. */
export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PetUpload {
  upload(file: File): Promise<{ assetId: string }>;
  crop(assetId: string, region: CropRegion): Promise<{ assetId: string }>;
  autoAnimate(assetId: string): Promise<{ spriteSheetId: string }>;
}
