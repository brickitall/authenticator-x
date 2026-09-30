/**
 * Decoder for `otpauth-migration://offline?data=...` — the QR code Google
 * Authenticator produces from "Transfer accounts → Export accounts".
 *
 * The payload is a protobuf message. Rather than pull in a protobuf runtime
 * (extra bundle weight and one more dependency to audit for a store review),
 * we read the handful of wire-format fields this one message uses.
 */
import { base32Encode } from '../util/base32.js';
import { fromBase64, fromUtf8 } from '../util/bytes.js';
import type { OtpAlgorithm, OtpType } from './types.js';
import type { ParsedOtpUri } from './uri.js';

const WIRE_VARINT = 0;
const WIRE_64BIT = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_32BIT = 5;

class ProtoReader {
  private offset = 0;

  constructor(private readonly buf: Uint8Array) {}

  get done(): boolean {
    return this.offset >= this.buf.length;
  }

  varint(): number {
    let result = 0;
    let shift = 0;
    while (true) {
      if (this.done) throw new Error('Truncated varint');
      const byte = this.buf[this.offset++]!;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
      if (shift > 63) throw new Error('Varint too long');
    }
  }

  bytes(): Uint8Array {
    const length = this.varint();
    if (this.offset + length > this.buf.length) throw new Error('Truncated length-delimited field');
    const slice = this.buf.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  /** Advance past a field we do not care about. */
  skip(wireType: number): void {
    switch (wireType) {
      case WIRE_VARINT:
        this.varint();
        return;
      case WIRE_64BIT:
        this.offset += 8;
        return;
      case WIRE_LENGTH_DELIMITED:
        this.bytes();
        return;
      case WIRE_32BIT:
        this.offset += 4;
        return;
      default:
        throw new Error(`Unsupported protobuf wire type: ${wireType}`);
    }
  }

  tag(): { field: number; wireType: number } {
    const key = this.varint();
    return { field: key >>> 3, wireType: key & 0x07 };
  }
}

const ALGORITHM_BY_ENUM: Record<number, OtpAlgorithm> = { 1: 'SHA1', 2: 'SHA256', 3: 'SHA512' };
const DIGITS_BY_ENUM: Record<number, number> = { 1: 6, 2: 8 };
const TYPE_BY_ENUM: Record<number, OtpType> = { 1: 'hotp', 2: 'totp' };

export interface MigrationPayload {
  items: ParsedOtpUri[];
  /** Google splits large exports across several QR codes. */
  batchSize: number;
  batchIndex: number;
  /**
   * Shared by every QR of one export and different for the next. Without it a
   * code from a second export — the user backed out and started again — would
   * be counted as progress on the first, and the scan would call itself done
   * with accounts still missing. Only ever compared for equality.
   */
  batchId: number;
}

function parseOtpParameters(bytes: Uint8Array): ParsedOtpUri | null {
  const reader = new ProtoReader(bytes);
  let secret: Uint8Array | null = null;
  let label = '';
  let issuer = '';
  let algorithm: OtpAlgorithm = 'SHA1';
  let digits = 6;
  let type: OtpType = 'totp';
  let counter = 0;

  while (!reader.done) {
    const { field, wireType } = reader.tag();
    switch (field) {
      case 1:
        secret = reader.bytes();
        break;
      case 2:
        label = fromUtf8(reader.bytes());
        break;
      case 3:
        issuer = fromUtf8(reader.bytes());
        break;
      case 4:
        algorithm = ALGORITHM_BY_ENUM[reader.varint()] ?? 'SHA1';
        break;
      case 5:
        digits = DIGITS_BY_ENUM[reader.varint()] ?? 6;
        break;
      case 6:
        type = TYPE_BY_ENUM[reader.varint()] ?? 'totp';
        break;
      case 7:
        counter = reader.varint();
        break;
      default:
        reader.skip(wireType);
    }
  }

  // MD5 and other unsupported algorithms come back as null so the caller can
  // report how many entries were skipped instead of importing a broken item.
  if (!secret || secret.length === 0) return null;

  // The label often still carries "Issuer:Account" even when issuer is set.
  const separator = label.indexOf(':');
  if (separator !== -1) {
    if (!issuer) issuer = label.slice(0, separator).trim();
    label = label.slice(separator + 1).trim();
  }

  return {
    type,
    secret: base32Encode(secret),
    algorithm,
    digits,
    period: 30,
    counter,
    issuer,
    label,
  };
}

export function isMigrationUri(uri: string): boolean {
  return /^otpauth-migration:\/\//i.test(uri.trim());
}

export function parseMigrationUri(uri: string): MigrationPayload {
  const trimmed = uri.trim();
  if (!isMigrationUri(trimmed)) throw new Error('Not an otpauth-migration:// URI');

  const dataParam = new URL(trimmed).searchParams.get('data');
  if (!dataParam) throw new Error('Migration URI is missing the "data" parameter');

  const reader = new ProtoReader(fromBase64(dataParam));
  const items: ParsedOtpUri[] = [];
  let batchSize = 1;
  let batchIndex = 0;
  let batchId = 0;

  while (!reader.done) {
    const { field, wireType } = reader.tag();
    switch (field) {
      case 1: {
        const parsed = parseOtpParameters(reader.bytes());
        if (parsed) items.push(parsed);
        break;
      }
      case 3:
        batchSize = reader.varint();
        break;
      case 4:
        batchIndex = reader.varint();
        break;
      case 5:
        batchId = reader.varint();
        break;
      default:
        reader.skip(wireType);
    }
  }

  return { items, batchSize, batchIndex, batchId };
}
