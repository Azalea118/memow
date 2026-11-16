// Compatibility exports for old callers; HR cannot capture or upload photos.
export function renderPhotoCamera(){return '<p>Employees send photos using the Northpoint Android app. Review them in Photo Library.</p>';}
export async function stampedPhoto(){throw Error('Use the employee Android app to send photos.');}
export async function handleCameraAction(){}
export function handleCameraChange(){return false;}
