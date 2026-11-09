import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAppError, formatErrorUserMessage } from '../../src/lib/errorHandler';

describe('Unit: Application Error Classifier & Handler (src/lib/errorHandler.ts)', () => {
  it('Kategori: network error (Failed to fetch, network request failed)', () => {
    const err = classifyAppError(new Error('Failed to fetch'));
    assert.equal(err.category, 'network');
    assert.ok(err.message.includes('Koneksi internet bermasalah'));

    const err2 = classifyAppError(new Error('NetworkError when attempting to fetch resource'));
    assert.equal(err2.category, 'network');
  });

  it('Kategori: worker_offline (koneksi ke port 4000 gateway)', () => {
    const err = classifyAppError(new Error('ECONNREFUSED 127.0.0.1:4000'));
    assert.equal(err.category, 'worker_offline');
    assert.ok(err.message.includes('Server WhatsApp Gateway offline'));
  });

  it('Kategori: auth_expired (401 / JWT Expired / session expired)', () => {
    const err = classifyAppError(new Error('JWT expired'));
    assert.equal(err.category, 'auth_expired');
    assert.ok(err.message.includes('Sesi login'));

    const err2 = classifyAppError(new Error('Invalid login credentials'));
    assert.equal(err2.category, 'auth_expired');
  });

  it('Kategori: rls_denied (Row Level Security violation / 42501)', () => {
    const err = classifyAppError(new Error('new row violates row-level security policy for table contacts'));
    assert.equal(err.category, 'rls_denied');
    assert.ok(err.message.includes('RLS'));

    const err2 = classifyAppError({ code: '42501', message: 'permission denied' });
    assert.equal(err2.category, 'rls_denied');
  });

  it('Kategori: duplicate (23505 Unique Constraint Violation)', () => {
    const err = classifyAppError(new Error('duplicate key value violates unique constraint'));
    assert.equal(err.category, 'duplicate');
    assert.ok(err.message.includes('sudah terdaftar'));
  });

  it('Kategori: validation (23514 check constraint violation)', () => {
    const err = classifyAppError(new Error('violates check constraint "contacts_phone_check"'));
    assert.equal(err.category, 'validation');
    assert.ok(err.message.includes('batasan basis data'));
  });

  it('Kategori: not_found (404 / PGRST116 / 23503 foreign key)', () => {
    const err = classifyAppError(new Error('PGRST116 JSON object requested, multiple (or no) rows returned'));
    assert.equal(err.category, 'not_found');
    assert.ok(err.message.includes('tidak ditemukan'));
  });

  it('Kategori: database_unavailable (503 / connection terminated)', () => {
    const err = classifyAppError(new Error('503 Service Unavailable'));
    assert.equal(err.category, 'database_unavailable');
    assert.ok(err.message.includes('tidak tersedia'));
  });

  it('Kategori: unknown fallback', () => {
    const err = classifyAppError(new Error('Custom unexpected error'));
    assert.equal(err.category, 'unknown');
    assert.ok(err.message.includes('Custom unexpected error'));
  });

  it('formatErrorUserMessage menggabungkan message dan actionableHint', () => {
    const formatted = formatErrorUserMessage(new Error('Failed to fetch'));
    assert.ok(formatted.includes('Koneksi internet bermasalah'));
    assert.ok(formatted.includes('Periksa koneksi internet'));
  });
});

