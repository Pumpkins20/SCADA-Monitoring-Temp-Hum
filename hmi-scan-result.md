# HMI Scan Result - Poller Screening

Tanggal: 2026-03-26

## Ruang Lingkup Screening

Screening ini membandingkan:

1. Mapping register/coil pada `poller.py`
2. Dokumen register map pada `Data Register.xlsx - Sheet1.csv`
3. Gejala test sistem: nama ruang berhasil dibaca, tetapi temperature dan humidity gagal dibaca

## Ringkasan Hasil

- Data string (nama ruang, detail ruang, nama sensor) terindikasi berhasil terbaca.
- Data numerik utama (temp/hum) terindikasi gagal/berisiko gagal terbaca.
- Semua data numerik lain yang pakai parser yang sama (calibrate, threshold, average) juga berisiko gagal.
- Data coil alarm/connection secara mapping sudah sesuai CSV.

## Screening Per Data (Sesuai CSV)

| Kategori CSV | Item | Alamat CSV | Kondisi di Poller | Status Screening |
|---|---|---:|---|---|
| Device_1..4 | Name | 1, 25, 49, 73 | Dibaca via `read_string_register()` | OK (indikasi berhasil) |
| Device_1..4 | Temp | 9, 33, 57, 81 | Dibaca via `read_data_register(..., count=1, signed=True)` | FAIL/RISK |
| Device_1..4 | Hum | 11, 35, 59, 83 | Dibaca via `read_data_register(..., count=1, signed=True)` | FAIL/RISK |
| Device_1..4 | calibrate_temp | 13, 37, 61, 85 | Parser numerik sama dengan temp/hum | FAIL/RISK |
| Device_1..4 | calibrate_hum | 15, 39, 63, 87 | Parser numerik sama dengan temp/hum | FAIL/RISK |
| Device_1..4 | over_temp | 17, 41, 65, 89 | Parser numerik sama dengan temp/hum | FAIL/RISK |
| Device_1..4 | under_temp | 19, 43, 67, 91 | Parser numerik sama dengan temp/hum | FAIL/RISK |
| Device_1..4 | over_hum | 21, 45, 69, 93 | Parser numerik sama dengan temp/hum | FAIL/RISK |
| Device_1..4 | under_hum | 23, 47, 71, 95 | Parser numerik sama dengan temp/hum | FAIL/RISK |
| Average | Temp | 97 | Parser numerik sama dengan temp/hum | FAIL/RISK |
| Average | Hum | 99 | Parser numerik sama dengan temp/hum | FAIL/RISK |
| Room | name | 101 | Dibaca via `read_string_register()` | OK (indikasi berhasil) |
| Room | detail | 107 | Dibaca via `read_string_register()` | OK/RISK rendah |
| Data Alarm | Device_1..4 Temp/Hum | Coil 1..8 | Dibaca via `read_coil(address-1)` | OK (mapping sesuai) |
| Status Alarm | Status | Coil 9 | Dibaca via `read_coil(address-1)` | OK (mapping sesuai) |
| Connection Alarm | Device_1..4 | Coil 10..13 | Dibaca via `read_coil(address-1)` | OK (mapping sesuai) |
| Status Alarm | Status | Coil 14 | Dibaca via `read_coil(address-1)` | OK (mapping sesuai) |

## Item Gagal/Perlu Fokus (Berdasarkan Gejala Temp/Hum Gagal)

Jika temp/hum gagal dibaca, maka item berikut ikut terdampak karena jalur parser yang sama:

1. Semua register numerik sensor: temp, hum, calibrate, over/under threshold (Device_1..4)
2. Average temp/hum HMI-level

## Indikasi Akar Masalah Teknis

1. Parser numerik saat ini membaca 1 register 16-bit (`count=1`) sebagai signed int.
2. Catatan implementasi sebelumnya menunjukkan data numerik HMI cenderung float32 (2 register/word pair), bukan int16 tunggal.
3. CSV menandai area 4X (holding register), tetapi default poller memakai FC04 saat `register_function` kosong (`row[3] or "04"`).
4. Fallback FC03/FC04 hanya aktif jika `ALLOW_FC_FALLBACK=true`; default saat ini `false`.

## Kesimpulan Screening

- Sesuai gejala yang diberikan, data string (khususnya room name) kemungkinan besar memang terbaca.
- Kegagalan utama ada pada kelompok data numerik (temp/hum dan turunannya), bukan pada mapping string/coil.
- Prioritas perbaikan ada pada format decoding numerik dan pemilihan function code baca register.