// ESC/POS command builder for 58mm / 80mm thermal Bluetooth printers

const ESC = 0x1b;
const GS = 0x1d;

function cmd(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

export const ESC_POS = {
  INIT: cmd(ESC, 0x40),
  ALIGN_CENTER: cmd(ESC, 0x61, 0x01),
  ALIGN_LEFT: cmd(ESC, 0x61, 0x00),
  ALIGN_RIGHT: cmd(ESC, 0x61, 0x02),
  BOLD_ON: cmd(ESC, 0x45, 0x01),
  BOLD_OFF: cmd(ESC, 0x45, 0x00),
  DOUBLE_HEIGHT_ON: cmd(GS, 0x21, 0x01),
  DOUBLE_HEIGHT_OFF: cmd(GS, 0x21, 0x00),
  FONT_LARGE: cmd(GS, 0x21, 0x11),
  FONT_NORMAL: cmd(GS, 0x21, 0x00),
  LINE_FEED: cmd(0x0a),
  CUT_PAPER: cmd(GS, 0x56, 0x42, 0x00),
  BEEP: cmd(ESC, 0x42, 0x03, 0x02),
};

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function padRight(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width) : str + ' '.repeat(width - str.length);
}

function padLeft(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width) : ' '.repeat(width - str.length) + str;
}

function twoCol(left: string, right: string, width = 32): string {
  const space = width - left.length - right.length;
  return space > 0 ? left + ' '.repeat(space) + right : left.slice(0, width - right.length) + right;
}

function divider(width = 32): string {
  return '-'.repeat(width) + '\n';
}

export interface ReceiptItem {
  name: string;
  customizations?: string;
  qty: number;
  price: number;
}

export interface ReceiptData {
  storeName: string;
  orderNumber: number;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  timestamp: string;
  thankYouMessage?: string;
}

export function buildReceiptBytes(data: ReceiptData, paperWidth = 32): Uint8Array {
  const chunks: Uint8Array[] = [];

  const push = (...parts: (Uint8Array | string)[]) => {
    for (const p of parts) {
      chunks.push(typeof p === 'string' ? encodeText(p) : p);
    }
  };

  push(ESC_POS.INIT);
  push(ESC_POS.ALIGN_CENTER);
  push(ESC_POS.FONT_LARGE);
  push(ESC_POS.BOLD_ON);
  push(`${data.storeName}\n`);
  push(ESC_POS.FONT_NORMAL);
  push(ESC_POS.BOLD_OFF);
  push(`Order #${data.orderNumber}\n`);
  push(`${data.timestamp}\n`);
  push(ESC_POS.ALIGN_LEFT);
  push(divider(paperWidth));

  for (const item of data.items) {
    const linePrice = `$${(item.price * item.qty).toFixed(2)}`;
    const itemLabel = item.qty > 1 ? `${item.qty}x ${item.name}` : item.name;
    push(twoCol(itemLabel, linePrice, paperWidth) + '\n');
    if (item.customizations) {
      push(`  ${item.customizations}\n`);
    }
  }

  push(divider(paperWidth));
  push(twoCol('Subtotal', `$${data.subtotal.toFixed(2)}`, paperWidth) + '\n');
  push(twoCol('Tax (8.25%)', `$${data.tax.toFixed(2)}`, paperWidth) + '\n');
  push(ESC_POS.BOLD_ON);
  push(twoCol('TOTAL', `$${data.total.toFixed(2)}`, paperWidth) + '\n');
  push(ESC_POS.BOLD_OFF);
  push(twoCol('Payment', data.paymentMethod, paperWidth) + '\n');
  push(divider(paperWidth));

  push(ESC_POS.ALIGN_CENTER);
  push(`${data.thankYouMessage ?? 'Thank you!'}\n`);
  push('The Moon Tea\n');
  push(ESC_POS.LINE_FEED);
  push(ESC_POS.LINE_FEED);
  push(ESC_POS.LINE_FEED);
  push(ESC_POS.CUT_PAPER);

  // Concatenate all chunks
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
