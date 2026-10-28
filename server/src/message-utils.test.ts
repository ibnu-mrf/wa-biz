import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractMessageText } from './message-utils';

describe('extractMessageText', () => {
  it('mengambil teks pesan biasa', () => {
    assert.equal(extractMessageText({ conversation: 'Halo WABiz' }), 'Halo WABiz');
  });

  it('mengambil teks extended text', () => {
    assert.equal(
      extractMessageText({ extendedTextMessage: { text: 'Informasi pendaftaran' } }),
      'Informasi pendaftaran',
    );
  });

  it('mengambil caption gambar', () => {
    assert.equal(
      extractMessageText({ imageMessage: { caption: 'Foto dokumen' } }),
      'Foto dokumen',
    );
  });

  it('mengambil caption video', () => {
    assert.equal(
      extractMessageText({ videoMessage: { caption: 'Video kegiatan' } }),
      'Video kegiatan',
    );
  });

  it('mengambil caption dokumen', () => {
    assert.equal(
      extractMessageText({ documentMessage: { caption: 'Berkas pendaftaran' } }),
      'Berkas pendaftaran',
    );
  });

  it('mengambil teks balasan tombol', () => {
    assert.equal(
      extractMessageText({ buttonsResponseMessage: { selectedDisplayText: 'Daftar' } }),
      'Daftar',
    );
  });

  it('mengambil teks balasan template', () => {
    assert.equal(
      extractMessageText({ templateButtonReplyMessage: { selectedDisplayText: 'Hubungi CS' } }),
      'Hubungi CS',
    );
  });

  it('membuka pembungkus ephemeral secara rekursif', () => {
    assert.equal(
      extractMessageText({
        ephemeralMessage: { message: { conversation: 'Pesan sementara' } },
      }),
      'Pesan sementara',
    );
  });

  it('membuka pembungkus view once', () => {
    assert.equal(
      extractMessageText({
        viewOnceMessage: { message: { conversation: 'Pesan sekali lihat' } },
      }),
      'Pesan sekali lihat',
    );
  });

  it('membuka pembungkus view once versi 2', () => {
    assert.equal(
      extractMessageText({
        viewOnceMessageV2: {
          message: { extendedTextMessage: { text: 'Pesan versi dua' } },
        },
      }),
      'Pesan versi dua',
    );
  });

  it('mengembalikan string kosong untuk pesan null atau tidak dikenal', () => {
    assert.equal(extractMessageText(null), '');
    assert.equal(extractMessageText(undefined), '');
    assert.equal(extractMessageText({ unknownMessage: {} }), '');
  });
});
