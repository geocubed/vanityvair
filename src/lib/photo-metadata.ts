export type PhotoMetadata = { description: string; photographer: string; is_screenshot: number };
export function validatePhotoMetadata(input: Record<string,unknown>, requireCredit = true): PhotoMetadata {
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const screenshot = input.is_screenshot === true || input.is_screenshot === 1;
  const photographer = screenshot ? '' : typeof input.photographer === 'string' ? input.photographer.trim() : '';
  if (!description || description.length > 500) throw new Error('Add a photo description of 1–500 characters.');
  if (requireCredit && !screenshot && (!photographer || photographer.length > 200)) throw new Error('Add the photographer’s name, or mark this image as a screenshot.');
  return {description,photographer,is_screenshot:screenshot ? 1 : 0};
}
export const photoCredit = (photo: Partial<PhotoMetadata>) => photo.is_screenshot ? 'Screenshot' : photo.photographer ? `Photo Credit: ${photo.photographer}` : '';
export const completePhoto = (photo: Partial<PhotoMetadata>) => Boolean(photo.description?.trim() && (photo.is_screenshot || photo.photographer?.trim()));

export const formatPhotoCredit = (credit: string) => !credit || credit === 'Screenshot' ? credit : `Photo Credit: ${credit.replace(/^(?:Photograph|Photo Credit):\s*/i, '')}`;
