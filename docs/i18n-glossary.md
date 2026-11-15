# T-DJ in Turkish: glossary

English is the source text and the default. Turkish (`apps/web/src/lib/i18n/tr.ts`) is written for Turkish milonga
DJs, in the words they use at the booth. It is not a word-for-word translation. Use these terms everywhere: the app,
the menus (`apps/desktop/src-tauri/src/menu.rs`) and any new string.

## How it works

- Strings live under flat keys in `lib/i18n/en.ts` (source) and `lib/i18n/tr.ts`. Call `t("key", { vars })`, or
  `plural("plural.x", n)` for a count (`Intl.PluralRules`). Use `fmtNumber`, `fmtDate`, `fmtTime` and `fmtList` for
  numbers, dates and lists, and `upper` / `lower` / `capFirst` for case (Turkish İ/ı).
- A word table at module level (a picker's choices, a tab list) is a getter or `lazy(() => …)`, so it is never frozen
  in the language the page loaded in.
- Settings › Language: Auto / English / Türkçe. Auto follows the browser's language, and in the Mac and iPad apps the
  system's language. The menu bar is Turkish when the system's first language is Turkish.
- A missing Turkish key falls back to English, with a warning in development. The vitest
  `lib/i18n/i18n.test.ts` fails on a missing key, a lost placeholder, or a Turkish value identical to the English
  one. `SAME_IN_TURKISH` lists the tango terms and names that may stay identical.
- Music data is never translated: song titles, orchestras, singers, albums and cortina songs stay as recorded. When
  they sit in an uppercase label they are marked `lang="es"`, so Turkish casing does not turn "Di Sarli" into
  "Dİ SARLİ".

## Tango terms (kept)

| English | Turkish | Note |
|---|---|---|
| tanda | tanda (pl. tandalar) | "3. tanda", "tanda 1/22" |
| cortina | **kortina** (pl. kortinalar) | the spelling of the App Store text (fastlane/metadata/tr) |
| milonga (event and rhythm) | milonga | "Cumartesi milongası" |
| vals | vals | "vals tandası" |
| tango | tango | |
| La Cumparsita | La Cumparsita | "La Cumparsita'ya kadar" |
| última | última | "última tandası" |
| práctica, encuentro, salón, milonguero/a | unchanged | |
| cantor / estribillista | cantor / estribillista | "Şarkıcı öncelikli (cantor)" |
| Guardia Vieja, Nuevo | unchanged | |
| Golden Age | Altın Çağ | era name; "altın çağ" in running text |
| big four | büyük dörtler | D'Arienzo, Di Sarli, Troilo, Pugliese |
| TTVTTM | TTVTTM | cycle codes stay |

## Screens and navigation

| English | Turkish |
|---|---|
| Compose (tab, screen) | Gece oluştur |
| Compose the night (button) | Geceyi oluştur |
| Regenerate | Yeniden oluştur |
| Booth | Kabin |
| Build by hand | Kendin oluştur |
| Library | Kütüphane |
| Database | Veritabanı |
| History | Geçmiş |
| Rooms | Odalar |
| Share | Paylaş |
| Settings | Ayarlar |
| Guide | Rehber |
| More (iPhone tab) | Daha fazla |
| Open a night | Bir gece aç |

The App Store text calls the player "Booth" as a proper name. The app uses **Kabin** (the DJ booth). Align the store
text the next time it is edited.

## The night

| English | Turkish |
|---|---|
| night / tonight | gece / bu gece |
| set, set list | set, set listesi |
| song / side, recording | şarkı / kayıt |
| track | parça |
| orchestra / singer | orkestra / şarkıcı |
| instrumental / vocal | enstrümantal / vokal |
| energy, energy arc | enerji, enerji eğrisi |
| peak, single / two peaks | zirve, tek / iki zirve |
| warm-up / build / peak / cool-down | ısınma / yükseliş / zirve / yavaşlama |
| era | dönem |
| heatmap | ısı haritası |
| best / good / uneven / outside years | en iyi / iyi / dengesiz yıllar / en iyi yılların dışında |
| score | puan |
| floor | pist |
| room (venue) | salon |
| cycle | döngü |
| seed | tohum |
| swap | değiştir |
| lock / unlock | kilitle / kilidi aç |
| pin (keep as is) | sabitle |
| improve, auto-improve | iyileştir, otomatik iyileştir |
| benchmark (published DJ sets) | karşılaştırma |
| Tell the DJ | DJ'e söyle |
| Edit with AI | Yapay zekâyla düzenle |
| feedback | geri bildirim |
| memory, learned preferences | hafıza, öğrenilen tercihler |
| rules, house rules | kurallar, ev kuralları |
| context, Tonight strip | bağlam, Bu gece |

## Booth (player)

| English | Turkish |
|---|---|
| Play / Pause / Resume / Stop | Çal / Duraklat / Devam et / Durdur |
| Fade (button) / fade in / fade out | Kıs / giriş / çıkış |
| Crossfade | Geçişli bağla |
| Next at gap | Aradan sonra sıradaki |
| Hold | Beklet |
| Break | Ara |
| Talk-over | Anons |
| Pre-listen, headphones | ön dinleme, kulaklık |
| Room output | Salon çıkışı |
| Rehearsal (30 s clips) | Prova (30 sn'lik klipler) |
| Cue / Stop (song handles) | Başlangıç / Bitiş |
| Skip tonight | Bu gece atla |
| Birthday vals | Doğum günü valsi |
| Master volume, mute | Ana ses, sessize al |
| Loudness | Ses yüksekliği |
| Key (musical) | Ton |

## Accounts, export and services

| English | Turkish |
|---|---|
| Export | Aktar |
| Import / restore | İçe aktar / geri yükle |
| preview | önizleme |
| playlist | çalma listesi |
| Connect / Log in / Log out | Bağla / Giriş yap / Çıkış yap |
| key (API key) | anahtar (API anahtarı) |
| model, provider, agent | model, sağlayıcı, ajan |
| AI | yapay zekâ |
| organiser | organizatör |
| Keychain | Anahtar Zinciri |
| data source | veri kaynağı |

Brand and file names (Spotify, Deezer, YouTube, Dropbox, Google Drive, MusicBrainz, Discogs, Rekordbox, Traktor,
Serato, VirtualDJ, Engine DJ, M3U8, CSV, XML) are not translated.

## Units and form

- `4 sa 36 dk` (hours, minutes); `30 sn` (seconds); `%60` (percent sign first); `0,5 sn` (decimal comma).
- Numbers and dates use `Intl` in `tr-TR`: `19.118 kayıt`, `15 Kasım`.
- Ordinals: `3. tanda`; "tanda 3 of 22" is `tanda 3/22`.
- Polite plural "siz" for instructions ("Seçin", "Dokunun"); the infinitive or imperative for buttons ("Kaydet",
  "Geceyi oluştur").
- Turkish does not pluralise after a number: `3 tanda`, `21 kayıt`.

## Left in English on purpose

- Song titles, orchestras, singers, albums and cortina songs: music data.
- The research notes of the context model (`data/knowledge/context_factors.json`), shown in the Guide marked
  `lang="en"`. They are knowledge data, not UI copy.
- Notes the engine writes in `packages/core` (tanda notes, `describeLearned`, score verdicts) that `djMessage` does
  not cover. The engine was being retuned in parallel, so it was not touched.
- The owner's console (`/admin`) and server error bodies from `/api`.
