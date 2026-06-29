# SplitKick+ — Phases (Execution Breakdown)

Bu doküman `prd.md` (ne), `docs.md` (nasıl), `plan.md` (ne zaman) ve `claude.md` (kurallar)
dosyalarını **uygulanabilir, dosya/fonksiyon düzeyinde fazlara** indirger. `plan.md` stratejiyi
ve takvimi tutar; bu doküman her fazın somut görev listesi, çıktısı ve "bitti" tanımıdır.

**Altın kural (plan.md §2):** her checkpoint'te çalışan bir uygulama olmalı. De-risk sırası:
Cüzdan → Domain → P2P → Loop → UI. Ödeme yolunu asla en sona bırakma.

**İhlal edilemez kurallar (claude.md):** teslim edilen kodda mock yok · gradient yok ·
para her yerde tamsayı minor unit · `apply` ve `/src/domain` saf/deterministik · seed asla
loglanmaz/replike edilmez · on-chain ödemenin online olduğu UI'da açık.

---

## Faz haritası ve bağımlılıklar

```
Faz 0  Kurulum ──┐
                 ├─► Faz 1  Cüzdan (WDK)  ──┐
Faz 2 Domain ────┘  (1 ve 2 paralel)        ├─► Faz 4  Loop ──► Faz 5  UI/Polish
Faz 3  P2P Ledger ──────────────────────────┘
```

| Faz | İçerik | Cup hedefi (plan.md §3) | Bağımlılık |
|---|---|---|---|
| 0 | Repo + proje iskeleti | Jun 28 kickoff | — |
| 1 | Cüzdan yolu (WDK) | Round of 16 öncesi | Faz 0 |
| 2 | Saf domain mantığı | Faz 1 ile paralel | Faz 0 |
| 3 | P2P ledger (Pears) | Jul 8 — Round of 16 | Faz 0, (2) |
| 4 | Birleştirme loop'u | Jul 10 — Çeyrek Final | Faz 1+2+3 |
| 5 | UI + cilalama | Jul 12–14 — Yarı Final/teslim | Faz 4 |

---

## Faz 0 — Kurulum ve iskelet

**Amaç:** çalışan boş Pear uygulaması, sabitlenmiş bağımlılıklar, lisans.

- [ ] `pear init` ile uygulamayı oluştur; ESM projesi kur (`"type": "module"`).
- [ ] `claude.md`'deki hedef yapıyı kur: `/src/{p2p,wallet,domain,ui}`, `/test`.
- [ ] Bağımlılıkları **tam sürümle** sabitle: `hyperswarm`, `corestore`, `autobase`,
      `hyperbee`, `hypercore-crypto`, `b4a`, `@tetherto/wdk`, `@tetherto/wdk-wallet-evm`.
- [ ] MIT veya Apache-2.0 LICENSE ekle (NFR-4).
- [ ] `package.json` script'leri: `pear run --dev .`, `npm test`.
- [ ] Public GitHub repo; ilk commit.

**Çıktı:** `pear run --dev .` boş kabuğu açar; `npm test` (boş) yeşil.
**Done =** repo public, bağımlılıklar kurulu ve sürümleri pinli, uygulama açılıyor.

---

## Faz 1 — Cüzdan yolu (WDK)  ▸ FR-3, FR-10, FR-12

**Amaç:** kendi-saklamalı (self-custodial) gerçek cüzdan; testnet'te gerçek USD₮ transferi.
Her şey kaysa bile bu tek başına geçerli bir WDK submission'ı (plan.md §2).

Dosyalar: `src/wallet/{wdk.js,config.js,units.js,seed-store.js}`, `scripts/wallet.mjs`,
`src/ui/{wallet-view.js,qr.js}`

- [x] Seed phrase üret/geri yükle (`WDK.getRandomSeedPhrase(24)`); cihaz güvenli deposunda sakla
      (`seed-store.js`, 0600, repo dışı). **Loglanmıyor / ledger'a yazılmıyor / replike edilmiyor.**
- [x] WDK orchestrator + EVM modül kaydı (`registerWallet('ethereum', WalletManagerEvm, { provider, chainId })`).
- [x] `getAddress()` ve `getBalance()`/`getTokenBalance()` **canlı Sepolia RPC**'ye karşı doğrulandı (FR-12).
- [x] `sendUsdt(to, amountMinor)` — gerçek ERC-20 USD₮ transferi (`account.transfer`); **tx hash** döndürür (FR-10).
      Minor unit → 6 ondalıklı big-int dönüşümü **yalnızca `units.js` sınırında** (claude.md money).
- [x] Minimal cüzdan ekranı (solid renk, gradient yok): bakiye, adres + QR (offline), ağ/zincir göstergesi (PRD §8 / FR-12).

- [x] **Testnet + mainnet** desteği: `config.js` iki ağ tutar — Sepolia (varsayılan, ücretsiz)
      ve Ethereum mainnet (opt-in `SPLITKICK_NETWORK=mainnet`, kanonik USD₮ `0xdAC17…ec7`,
      gerçek-para uyarısı). İkisi de canlı doğrulandı.

> **API doğrulaması:** `docs.md §8.3`'teki `account.sendTransaction({to, token, value})` kurulu
> beta sürümünde **yanlış**; gerçek imza `account.transfer({ token, recipient, amount })` → `{ hash, fee }`.
> Bakiye `getTokenBalance(addr)`, adres `getAddress()`. Kod kurulu API'ye göre yazıldı.

**Done =** kod yolu uçtan uca gerçek ve canlı doğrulandı (gerçek adres türetme, canlı bakiye okuma,
gerçek USDT kontratına karşı `transfer` kurulumu — sıfır bakiyede zincir "exceeds balance" ile revert
etti, yani yol gerçek). Görünür tx hash'li broadcast için adresin testnet faucet'ten fonlanması gerekir
(harici, captcha-kapılı — kullanıcı eylemi).

---

## Faz 2 — Domain mantığı (saf, test edilmiş)  ▸ FR-4, FR-7, FR-8

**Amaç:** bakiye + minimal-transfer settlement, I/O'suz, kanıtlanabilir doğru. Faz 1 ile paralel.
`/src/domain` tamamen saf ve deterministik kalır (claude.md determinism).

Dosyalar: `src/domain/{entries.js,balances.js,settlement.js}`, `test/domain.test.js`

- [x] `entries.js`: entry tipleri ve doğrulama — `expense`, `payment`, `wallet`, `addWriter`
      (docs.md §5 şeması). Tutarlar tamsayı minor unit; `makeExpense`/`makePayment` ts'i dışarıdan alır
      (domain'de `Date.now` yok). Float/negatif/eksik-txHash reddedilir.
- [x] `balances.js` → `computeBalances(entries)`: net bakiye (+ alacaklı / − borçlu).
      Eşit bölüşümde kalanı **deterministik** dağıt (docs.md §7.1 `splitShares`); `payment` tx hash
      üzerinden **idempotent**.
- [x] `settlement.js` → `settlementPlan(net)`: greedy min-cash-flow → minimal transfer kümesi
      (docs.md §7.2); beraberlik memberId ile bozulur → net anahtar sırasından bağımsız, deterministik.
- [x] Birim testleri (13 domain testi): 5 kişilik gezi → **4 transfer** ve herkes sıfırlanır; kalan
      dağıtımı; idempotent `payment`; determinizm; korunum (plan net'i tam sıfırlar); custom split.

**Not (scope, prd.md §11 / plan.md §6):** equal-only **ve** custom split ikisi de destekleniyor + test edildi.

**Done =** bakiye + minimal settlement test'lerle kanıtlanabilir doğru (26/26 yeşil), hiç I/O yok.

---

## Faz 3 — P2P ledger (Pears)  ▸ FR-1, FR-2, FR-5, FR-6

**Amaç:** sunucusuz, çok-yazarlı, yeniden başlatmaya dayanıklı ortak ledger. İki peer aynı görüşe
yakınsar.

Dosyalar: `src/p2p/{topic.js,swarm.js,ledger.js}`, `test/p2p.test.js`, `scripts/verify-p2p.mjs`

- [x] `topic.js`: grup secret'ından deterministik 32-byte topic; invite code round-trip eder
      (`crypto.hash(groupSecret)`, hex invite — docs.md §6.1). Birim testli. (FR-1, FR-2)
- [x] `swarm.js`: Hyperswarm join (`{ server: true, client: true }`), `store.replicate(conn)`,
      temiz kapanış / DHT kaydı bırakma (Pear varsa `Pear.teardown`, yoksa `destroy()`). (docs.md §6.2)
- [x] `ledger.js`: Autobase + Hyperbee view; `apply` `addWriter` (`host.addWriter(key,{indexer:true})`)
      + entry'leri **sortable key** ile işler; Corestore ile kalıcı; `ackInterval` ile yakınsama.
      `apply` içinde **`Date.now()` yok**, ts entry payload'ından gelir.
- [x] İki süreç aynı bootstrap'a katılır ve **byte-byte özdeş view'a yakınsar** — `verify-p2p.mjs` ile
      kanıtlandı (B writer olarak yetkilendirildi, iki harcama yakınsadı). (FR-5)
- [x] Yeniden başlatmaya dayanıklı — A diskten yeniden açıldığında özdeş view (FR-6).

**Sürüm uyarısı (çözüldü):** Autobase imzası kurulu `autobase@7.28.1`'e göre doğrulandı —
`apply(nodes, view, host)` + `host.addWriter(key, { indexer: true })`, view = Hyperbee. Kod buna göre.

**Done =** gerçek çok-yazarlı sync (30/30 test + `npm run p2p:verify` PASS), sunucu yok, restart'tan sağ çıkıyor.

---

## Faz 4 — Birleştirme loop'u  ▸ FR-9, FR-11, FR-13

**Amaç:** cüzdan + ledger'ı birleştiren para döngüsü. Offline ekle → online settle → herkeste temizlenir.

Dosyalar: `server/bridge.mjs` (`doSettle`), `web/components/GroupLedger.jsx`, `scripts/verify-settle.mjs`

- [x] Katılımda cüzdan adresini ledger'a yayınla: `{ type: 'wallet', ... }` (`publishMembership`). (FR-3 sürekliliği)
- [x] "Settle": plan transfer → ledger'dan alacaklı adresini çöz → WDK `sendUsdt` → `payment` entry
      (txHash idempotency key) (FR-9, FR-11). Backend `POST /api/settle`.
- [x] Replike olan `payment`, borcu **tüm peer'lerde** temizler — `verify-settle.mjs` ile kanıtlandı
      (B'nin borcu A:0/B:0'a indi, aynı txHash'in retry'ı çift saymadı).
- [x] UI'da online/offline net; "Pay in USD₮" yalnız online + senin borcun için aktif (FR-13).

**Done =** expense'i offline ekle → online settle et → herkes temizlendiğini görür. Loop mekaniği
`npm run settle:verify` PASS; gerçek on-chain gönderim Faz 1'de doğrulanan cüzdan yolu (fon gerektirir).

---

## Faz 5 — UI + cilalama  ▸ PRD §8, NFR-4, NFR-5

**Amaç:** bir yabancının dakikalar içinde kurup anlayabileceği, flat ve hızlı arayüz.

> **Frontend stack kararı (kullanıcı, 2026-06-29): Next.js + React.** Holepunch + WDK Node'da
> çalıştığından mimari = **Node backend (`server/`) + Next.js frontend (`web/`)**, HTTP/SSE ile.
> Bu, dokümanların "tek Bare app + vanilla HTML UI" tezinin yerine geçer. Frontend iskeleti Faz 3
> ile birlikte kuruldu (backend bridge ledger/cüzdan/domain'i açıyor); cilalama Faz 5'te.

Dosyalar: `web/` (Next.js App Router, React), `server/{bridge.mjs,index.mjs}`, `scripts/dev.mjs`

- [x] Frontend Next.js/React'e taşındı; backend bridge (REST + SSE) gerçek modülleri açıyor; build geçiyor.
- [x] PRD ekranları: Wallet (bakiye + adres **QR** offline + ağ göstergesi), Onboarding (create/join),
      Group ledger, Add expense, Settle up (**gerçek Pay in USD₮**).
- [x] **Solid renk, flat tema. Gradient yok.** Online/offline göstergesi; empty/error/loading state'leri.
- [x] Tek komutla çalıştırma: `npm run app` (backend :8787 + frontend :3000 birlikte). README out-of-the-box (NFR-5).

**Done =** `npm install && (cd web && npm install)` → `npm run app` ile bir yabancı kurar, çalıştırır;
gerçek cüzdan (QR), P2P ledger, bakiye, minimal plan ve on-chain settle'ı dakikalar içinde görür.

---

## Scope kesintileri (zaman daralırsa — alttan kes, plan.md §6)

1. Custom (eşit olmayan) split → önce equal-only.
2. Çoklu eşzamanlı grup → tek grubu iyi yap.
3. Süslü onboarding → minimal create/restore + join code.
4. Mobil + masaüstü ikisi birden → offline sync'i en iyi gösteren tek yüzeyi seç.

**Asla kesilmez:** gerçek USD₮ transferi, gerçek P2P sync, para doğruluğu.

---

## Gereksinim → faz izlenebilirliği

| Faz | Karşılanan FR (prd.md §6) |
|---|---|
| 1 | FR-3 (kısmen), FR-10, FR-12 |
| 2 | FR-4, FR-7, FR-8 |
| 3 | FR-1, FR-2, FR-5, FR-6 |
| 4 | FR-3, FR-9, FR-11, FR-13 |
| 5 | (UI bütünü), NFR-4, NFR-5 |

**Sürekli NFR'ler (her fazda geçerli):** NFR-1 self-custody · NFR-2 determinizm ·
NFR-3 offline-first · NFR-6 performans.
