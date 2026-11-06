/** Utilidades de sensores del dispositivo. */

/** Pide permiso de orientación en iOS (debe llamarse dentro de un gesto del usuario). */
export async function requestOrientationPermission() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      return (await DeviceOrientationEvent.requestPermission()) === 'granted';
    }
  } catch {
    /* sin permiso: se usa un ángulo fijo */
  }
  return true;
}
