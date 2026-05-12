import { BleManager, Device, State } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

// Common ESC/POS BLE printer service & characteristic UUIDs
const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic ESC/POS
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Serialport BLE
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Common thermal printer
];

const PRINTER_CHAR_UUIDS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
];

// Chunk size – BLE MTU is usually 20 bytes, some printers support 512
const CHUNK_SIZE = 200;

let manager: BleManager | null = null;

function getManager(): BleManager {
  if (!manager) manager = new BleManager();
  return manager;
}

export interface PrinterDevice {
  id: string;
  name: string;
  rssi: number | null;
}

export async function requestBlePermissions(): Promise<boolean> {
  // Permissions are requested natively via app.json plugin config on iOS.
  // On Android 12+ the ble-plx plugin handles runtime request at scan time.
  return true;
}

export async function waitForBlePoweredOn(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const sub = getManager().onStateChange((state) => {
      if (state === State.PoweredOn) {
        sub.remove();
        resolve();
      }
    }, true);
    setTimeout(() => {
      sub.remove();
      reject(new Error('Bluetooth did not power on in time'));
    }, timeoutMs);
  });
}

export function scanForPrinters(
  onFound: (device: PrinterDevice) => void,
  onError: (err: Error) => void,
  durationMs = 8000,
): () => void {
  const seen = new Set<string>();
  getManager().startDeviceScan(
    null,
    { allowDuplicates: false },
    (error, device) => {
      if (error) {
        onError(error);
        return;
      }
      if (!device) return;
      const name = device.name ?? device.localName ?? '';
      // Accept named devices only (printers always have a name)
      if (!name || seen.has(device.id)) return;
      seen.add(device.id);
      onFound({ id: device.id, name, rssi: device.rssi });
    },
  );

  const timer = setTimeout(() => getManager().stopDeviceScan(), durationMs);
  return () => {
    clearTimeout(timer);
    getManager().stopDeviceScan();
  };
}

export async function connectToPrinter(deviceId: string): Promise<Device> {
  const m = getManager();
  const device = await m.connectToDevice(deviceId, {
    requestMTU: 512,
    timeout: 10000,
  });
  await device.discoverAllServicesAndCharacteristics();
  return device;
}

export async function disconnectPrinter(deviceId: string) {
  await getManager().cancelDeviceConnection(deviceId);
}

async function findWritableChar(
  device: Device,
): Promise<{ serviceUUID: string; charUUID: string } | null> {
  const services = await device.services();
  for (const svc of services) {
    const chars = await svc.characteristics();
    for (const ch of chars) {
      if (ch.isWritableWithResponse || ch.isWritableWithoutResponse) {
        return { serviceUUID: svc.uuid, charUUID: ch.uuid };
      }
    }
  }
  return null;
}

export async function printBytes(device: Device, data: Uint8Array): Promise<void> {
  const target = await findWritableChar(device);
  if (!target) throw new Error('No writable characteristic found on printer');

  const { serviceUUID, charUUID } = target;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    const b64 = Buffer.from(chunk).toString('base64');
    await device.writeCharacteristicWithResponseForService(serviceUUID, charUUID, b64);
  }
}

export function destroyBleManager() {
  manager?.destroy();
  manager = null;
}
