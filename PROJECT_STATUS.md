# Smart Barber Studio — Documentazione di Progetto & Stato Avanzamento
*Aggiornato al: 21 Novembre 2026*
*Salone di riferimento: Barbershop Roberto Baccaro (Barberia "Dal 1958" • Torino, C.so Orbassano 230/a)*

Questo documento funge da **memoria persistente e fonte di verità tecnica** dell'applicazione per sviluppatori e modelli AI. Riassume l'architettura, lo stack tecnologico, lo stato di implementazione delle funzionalità, i rischi di sicurezza, le direttive per gli sviluppi futuri e la suite di test per il collaudo prima del rilascio.

---

## 1. Panoramica & Stack Tecnologico

### Obiettivo del Software
Applicazione web mobile-first (PWA) progettata per un salone di barbieri di alto livello. Gestisce:
- Prenotazioni online clienti con visualizzazione slot in tempo reale.
- Assistente Virtuale AI (Gemini) per risposte e ricerca disponibilità senza allucinazioni.
- Carta Fedeltà digitale ("10 appuntamenti = Taglio + Barba in omaggio").
- Politica Anti-No Show con blocco automatico al 3° mancato appuntamento.
- Notifiche urgenti e allarme acustico in cassa per disdette o richieste immediate.
- Pannello di controllo Admin per il titolare (gestione agenda, orari, ferie, clienti e note riservate).

### Stack Tecnologico
- **Framework:** Next.js 16.4.3 (App Router, Turbopack, React 19.3.0, Server Actions)
- **Linguaggio & Tipi:** TypeScript 5 (Strict Mode), Zod
- **Database & Auth:** Supabase (PostgreSQL, Supabase Auth, Supabase Storage, Realtime)
- **AI & LLM:** Vercel AI SDK (`ai` 7.0 + `@ai-sdk/google` 4.0), Google Gemini (`gemini-flash-lite-latest`)
- **Stile & UI:** Tailwind CSS v4, Lucide React, Glassmorphism luxury dark/amber palette
- **Date & Orari:** `date-fns` 4.4.0 (localizzazione italiana)
- **PWA:** Manifest PWA integrato, `@ducanh2912/next-pwa` (Workbox Service Worker attivo in produzione)

### Mappa Essenziale Cartelle e File Critici
```
barber-app/
├── src/
│   ├── app/
│   │   ├── actions/                  # Server Actions Next.js (Logica di backend)
│   │   │   ├── admin.ts              # Gestione agenda, blocchi, ferie, impostazioni (Autenticato)
│   │   │   ├── alerts.ts             # Allarmi urgenti e notifiche sonore (Autenticato)
│   │   │   ├── auth.ts               # Autenticazione admin (PIN) e clienti (No backdoor)
│   │   │   ├── availability.ts       # Query disponibilità per datepicker
│   │   │   ├── booking.ts            # Prenotazione, cancellazione, spostamento
│   │   │   ├── fidelity.ts           # Calcolo e gestione punti carta fedeltà
│   │   │   ├── handoff.ts            # Trasferimento chat da AI a barbiere umano
│   │   │   ├── live-chat.ts          # Gestione sessioni chat in tempo reale
│   │   │   ├── salon.ts              # Informazioni pubbliche, listino e contatti
│   │   │   ├── upload.ts             # Upload foto lookbook cliente su Supabase Storage
│   │   │   └── whatsapp.ts           # Notifiche e link diretti WhatsApp wa.me
│   │   ├── admin/                    # Rotte riservate al barbiere (/admin, /admin/login)
│   │   ├── api/
│   │   │   ├── calendar/ical/route.ts # Feed iCal / Webcal protetto da token segreto (?token=...)
│   │   │   └── chat/route.ts         # Endpoint di streaming assistente AI (Gemini)
│   │   ├── book/page.tsx             # Pagina calendario 14 giorni cliente
│   │   ├── chat/page.tsx             # Pagina chat con Assistente Virtuale
│   │   ├── layout.tsx                # Root layout con header fedeltà e manifest PWA
│   │   └── page.tsx                  # Homepage pubblica aperta (listino, orari, bottoni prenotazione)
│   ├── components/
│   │   ├── admin/                    # Viste e modali pannello titolare
│   │   ├── auth/                     # Form di accesso cliente
│   │   ├── booking/                  # DateStrip, SlotPicker, BookingModal, ManageModal
│   │   ├── chat/                     # ChatView client con parsing tag [[SLOTS:...]]
│   │   ├── fidelity/                 # FidelityCardModal interattiva con timbri
│   │   ├── navigation/               # ClientRecognitionHeader (barra punti in alto)
│   │   ├── pwa/                      # PwaInstallPrompt per smartphone
│   │   └── salon/                    # Modal listino trattamenti e orari negozio
│   ├── data/                         # File JSON locali di fallback
│   ├── lib/
│   │   ├── auth/                     # Token HMAC sessione admin, rate limiting
│   │   ├── booking/slots.ts          # Motore batch calcolo slot liberi & cache in-memory 25s
│   │   ├── supabase/                 # Client admin (Service Role) e browser anonimo
│   │   └── sound.ts                  # Sintetizzatore Web Audio per allarme e chime
│   └── types/database.ts             # Schemi TypeScript Supabase e costanti predefinite
├── public/                           # Asset statici, icone PWA e manifest.json
└── PROJECT_STATUS.md                 # Questo documento
```

---

## 2. Stato di Avanzamento Lavori

### Macro-Funzionalità & Stato Reale
| Funzionalità | Stato | Note Tecniche |
|---|:---:|---|
| **Calendario & Prenotazione Clienti** | `[x]` | DateStrip 14 giorni, SlotPicker con pausa pranzo e orari passati, blocco overbooking. |
| **Calcolo Slot deterministico** | `[x]` | Ottimizzato con `getAvailableSlotsForRange` in batch (3 query) + cache 25s + timeout 2s. |
| **Assistente Virtuale AI (Chat)** | `[x]` | Gemini con policy zero-allucinazioni, pulsanti `[[SLOTS:...]]`, streaming rapido (~1s). |
| **Carta Fedeltà (Fidelity Card)** | `[x]` | Visualizzazione timbri (10 punti), sblocco premio, badge cliente VIP riconosciuto. |
| **Politica Anti-No Show** | `[x]` | Blocco prenotazione al 3° appuntamento segnato `no_show` con procedura di riabilitazione. |
| **Gestione / Disdetta da Cliente** | `[x]` | Verifica preavviso minimo (default 2h), sirena urgente al barbiere per disdette last-minute. |
| **Pannello Admin - Agenda** | `[x]` | Vista giorno/mese/anno, blocco rapido slot, prenotazione banco/telefonica, note cliente. |
| **Pannello Admin - Ferie & Chiusure** | `[x]` | Aggiunta ferie a intervallo date (upsert batch) e chiusure straordinarie singole. |
| **Allarmi Sonori Urgenti** | `[x]` | Web Audio API (chime per nuova prenotazione, sirena rossa per disdette ravvicinate). |
| **Feed Sincronizzazione iCal** | `[x]` | Protetto da token segreto (`?token=...`) e sessione admin HMAC (`verifyAdminSignedToken`). |
| **Autenticazione Admin (Barbiere)** | `[x]` | Login con PIN e cookie HMAC-SHA256; tutte le Server Actions in `admin.ts` e `alerts.ts` protette da `requireAdminSession()`. |
| **Autenticazione Clienti** | `[x]` | Login con Rate-Limit, backdoor `123456` rimossa, OTP confidenziale su WhatsApp senza leak in JSON di produzione. |
| **PWA & Offline** | `[x]` | Service Worker configurato con `@ducanh2912/next-pwa` in `next.config.ts` con caching e skipWaiting. |
| **Homepage UX** | `[x]` | Accesso libero e fluido: prezzi, orari e prenotazione accessibili senza login forzato. |
| **Live Chat Operatore Umano** | `[~]` | Funzionante ma sessioni salvate in JSON dentro `business_settings.daily_schedules`. |
| **Integrazione WhatsApp** | `[~]` | Link diretti `wa.me` funzionanti; invio automatico Cloud API predisposto. |
| **Pagamenti Online (Stripe)** | `[ ]` | Scheletro tipi e campi presenti; salone opera su pagamento in cassa. |

---

## 3. Problemi Aperti & Debito Tecnico Risolto

### 🟢 Criticità Risolte con Successo
1. **Server Actions Admin protette ([src/app/actions/admin.ts](file:///src/app/actions/admin.ts) & [src/app/actions/alerts.ts](file:///src/app/actions/alerts.ts)):**
   - Implementato `requireAdminSession()` all'inizio di tutte le azioni amministrative (`updateAdminSettings`, `cancelAppointmentByAdmin`, `quickBlockSlot`, `adjustClientFidelityPoints`, `getAllClientInternalNotes`, `fetchPendingAlerts`, `acknowledgeAlert`, ecc.). Blocca qualsiasi invocazione non autenticata con errore 401.
2. **Feed iCal protetto da token segreto ([src/app/api/calendar/ical/route.ts](file:///src/app/api/calendar/ical/route.ts)):**
   - Accesso consentito solo con query parameter `?token=...` valido o sessione admin attiva con verifica a tempo costante (`constantTimeCompare`). L'URL sicuro con token viene generato e copiato direttamente dall'interfaccia Admin.
3. **Rimozione Backdoor OTP e sanificazione risposte ([src/app/actions/auth.ts](file:///src/app/actions/auth.ts)):**
   - Eliminato il bypass `123456`.
   - `simulatedOtp` rimosso dai payload HTTP in ambiente di produzione (visibile solo se `NODE_ENV === "development"`).
4. **Resilienza Serverless per Filesystem ([src/app/actions/admin.ts](file:///src/app/actions/admin.ts)):**
   - Tutte le scritture su file locale sono racchiuse in blocchi `try/catch` per evitare crash `EROFS` su serverless/Vercel; le note interne vengono salvate e lette prioritariamente su Supabase `profiles.internal_notes`.
5. **Muro di login forzato in Homepage eliminato ([src/app/page.tsx](file:///src/app/page.tsx)):**
   - La homepage accoglie chiunque mostrando il salone, i prezzi, gli orari e i bottoni di prenotazione (AI o Calendario). Il login è opzionale per la sola tessera fedeltà.
6. **PWA Service Worker abilitato ([next.config.ts](file:///next.config.ts)):**
   - Integrato `@ducanh2912/next-pwa` con `dest: "public"` e `workboxOptions: { skipWaiting: true }`.
7. **Gestione Dinamica & Recupero del PIN Salone ([src/app/actions/auth.ts](file:///src/app/actions/auth.ts), [src/app/admin/login/page.tsx](file:///src/app/admin/login/page.tsx), [src/components/admin/AdminSettingsView.tsx](file:///src/components/admin/AdminSettingsView.tsx)):**
   - Sostituzione del PIN abilitata dal pannello impostazioni `/admin` con hash crittografico HMAC-SHA256 salvato su Supabase (`business_settings`).
   - Flusso di recupero PIN integrato in `/admin/login` con invio di codice monouso sul WhatsApp personale del titolare Roberto Baccaro (`331 81 76 178`).
8. **Riorganizzazione Modulare Sotto-Sezioni Impostazioni ([src/components/admin/AdminSettingsView.tsx](file:///src/components/admin/AdminSettingsView.tsx)):**
   - Eliminato il muro di scroll verticale (oltre 1500 righe in un unico blocco).
   - Introdotta barra di navigazione a 5 schede specializzate con icone e badge dinamici:
     - ⏰ **Orari & Turni:** orari settimanali per singolo giorno, orario continuato/pausa pranzo, copia lunedì, durata slot default.
     - 🌴 **Ferie & Chiusure:** periodo vacanze a intervallo date (con calcolo automatico gg) e chiusure singole con lista e rimozione rapida.
     - ✂️ **Listino Servizi & Prezzi:** lista trattamenti, modifica inline rapida, aggiunta servizi, ripristino default e opzioni di pagamento.
     - 🛡️ **Regole & Fedeltà:** preavviso disdetta online, finestra massima di prenotazione futura (duplicato rimosso), configurazione carta fedeltà.
     - ⚙️ **Recapiti, Suoni & PIN:** telefoni salone, agenda whatsapp titolare, test sonoro campana e modulo cambio PIN.
   - Aggiunto pulsante di salvataggio rapido in testata e a fondo pagina con feedback immediato per evitare qualsiasi scroll inutile.
9. **Fix Streaming AI con Gemini Flash Lite ([src/app/api/chat/route.ts](file:///src/app/api/chat/route.ts)):**
   - Rimosso il parametro non supportato `thinkingConfig` che causava errore 400 da Google Gemini, ripristinando risposte in streaming sub-secondo (~800ms).
10. **Preservazione Storico Live Chat & Risoluzione Notifica Bloccata ([src/components/chat/ChatView.tsx](file:///src/components/chat/ChatView.tsx)):**
   - Corretto il bug per cui i messaggi scambiati in diretta con il barbiere sparivano al rilascio della chat all'AI (`mergeLiveSessionIntoMessages`).
   - Eliminato il box fuorviante con pulsante lampeggiante "Avviso in cassa attivato / In attesa del barbiere" che rimaneva bloccato dopo la conclusione o l'annullamento della richiesta.
   - Eliminati i bubble vuoti (ghost placeholder) in caso di loading o interruzioni stream.

### 🟡 Debito Tecnico Residuo (Non bloccante per il lancio)
1. **Serializzazione Live-Chat in `business_settings`:** I messaggi chat risiedono in una colonna JSON di `business_settings`. Per volumi elevati, è consigliabile migrarli su una tabella `chat_messages` con Supabase Realtime.
2. **Colonna Servizio nativa in `appointments`:** Il servizio viene dedotto dal campo note (`[Trattamento: ...]`) via regex invece di una foreign key dedicata `service_id`.

---

## 4. Roadmap & Sviluppi Futuri Consigliati

### Fase 1: Hardening di Sicurezza & Produzione Immediata (Completata)
- [x] Aggiungere il controllo `if (!(await isAdminSession())) throw new Error("Unauthorized");` a tutte le Server Actions in `admin.ts` e `alerts.ts`.
- [x] Proteggere la rotta iCal con un token segreto in query param (es. `/api/calendar/ical?token=...`).
- [x] Rimuovere la backdoor dev `123456` e la proprietà `simulatedOtp` dalla risposta JSON di produzione in `auth.ts`.
- [x] Resilienza Serverless: isolare le scritture `fs` e sincronizzare le note interne su Supabase.

### Fase 2: Esperienza Utente & Conversione (Completata)
- [x] Rimuovere il blocco login obbligatorio in Homepage: mostrare liberamente listino, info salone e calendario.
- [x] Configurare correttamente `withPWA` in `next.config.ts` per rendere l'app installabile a pieno titolo su Android e iOS.
- [ ] Aggiungere la colonna `service_name` e `service_id` alla tabella `appointments` con migrazione SQL per evitare il parsing da regex.

### Fase 3: Automazione & Fidelizzazione (Post-Lancio)
- [ ] **Promemoria automatici WhatsApp/SMS:** invio promemoria automatico 24h e 2h prima dell'appuntamento (il modo più efficace per azzerare i no-show).
- [ ] **Spostamento tabelle Live Chat su Supabase:** migrare i messaggi su una tabella relazionale `chat_messages` con Realtime subscription nativa anziché polling JSON.
- [ ] **Reportistica Finanziaria Semplice:** pagina Admin con riepilogo incassi giornalieri/settimanali (contanti vs POS), tagli eseguiti e tasso di ritorno clienti.

---

## 5. Linee Guida per Futuri Agenti AI

Quando lavori su questo progetto, segui rigorosamente queste regole:

1. **Non rompere il calcolo deterministico degli slot:**
   - La disponibilità oraria dipende da `src/lib/booking/slots.ts` (`computeDayAvailability` e `getAvailableSlotsForRange`). Non reintrodurre query individuali per giorno in loop.
   - Ogni volta che crei, cancelli o sposti un appuntamento, ricordati di chiamare `invalidateSlotsCache()` per aggiornare immediatamente l'assistente AI.

2. **Sicurezza delle Server Actions:**
   - Qualsiasi nuova Server Action destinata al barbiere DEVE verificare `await requireAdminSession()`.
   - Non fidarsi mai degli input client: normalizzare sempre i numeri di telefono con `normalizePhoneDigits(phone)`.

3. **Mantenimento di questo documento:**
   - Se completi una voce della roadmap, modifichi lo schema del database o aggiungi una nuova variabile d'ambiente, **aggiorna questo file `PROJECT_STATUS.md`** al termine del tuo turno.

---

## 6. Piano di Collaudo Operativo (Test Suite Manuale & Funzionale)

### A. Test Suite Lato Cliente (Esperienza Utente & Prenotazione)
- [ ] **TC-CLI-01: Landing Page & Consultazione Libera**
  - Aprire la homepage in navigazione anonima.
  - Verificare che compaiano logo, indirizzo, telefono e orari senza alcun muro di login forzato.
  - Cliccare su *Listino Prezzi* e su *Orari Salone*: verificare l'apertura istantanea del modale informativo.
- [ ] **TC-CLI-02: Prenotazione Guidata via Assistente AI (Gemini)**
  - Navigare su `/chat`.
  - Inviare: *"Vorrei prenotare un taglio per domani pomeriggio"*.
  - Verificare che la risposta arrivi entro 1-2 secondi con i chip orari interattivi `[[SLOTS:...]]`.
  - Cliccare su un orario: verificare che si apra il modale di conferma con i dettagli pre-compilati.
  - Completare l'inserimento di Nome e Cellulare e confermare. Verificare la notifica sonora/visiva di successo.
- [ ] **TC-CLI-03: Prenotazione da Calendario Manuale (14 Giorni)**
  - Navigare su `/book`.
  - Selezionare una data futura dal DateStrip orizzontale.
  - Selezionare un orario libero (verificando che gli orari passati o occupati siano disabilitati).
  - Procedere alla conferma con nome e telefono. Verificare il salvataggio su Supabase e l'invalidation della cache.
- [ ] **TC-CLI-04: Riconoscimento Cliente & Tessera Fedeltà**
  - Riaprire la homepage: verificare che compaia il badge *"Cliente riconosciuto (+39...)"*.
  - Cliccare sulla barra fedeltà o sul pulsante timbri: verificare che la tessera mostri il timbro aggiunto (+1 punto).
- [ ] **TC-CLI-05: Gestione / Disdetta Appuntamento (Soglia 2 Ore)**
  - Dalla homepage, cliccare su *I Miei Appuntamenti / Disdici*.
  - Inserire il proprio numero di cellulare se non precompilato.
  - Verificare che compaia l'appuntamento appena prenotato.
  - Testare il tasto *Disdici*: se l'appuntamento è ad oltre 2 ore, verificare l'annullamento con rilascio immediato dello slot.
  - Se l'appuntamento è a meno di 2 ore, verificare la comparsa dell'avviso con invito a chiamare direttamente il salone al telefono/WhatsApp.
- [ ] **TC-CLI-06: PWA & Installazione Mobile**
  - Aprire il sito da Chrome Mobile (Android) o Safari (iOS).
  - Verificare la comparsa del banner di installazione PWA e verificare che il manifest contenga icone, theme_color `#09090b` e `standalone`.

---

### B. Test Suite Lato Admin / Barbiere (Gestione Salone & Sicurezza)
- [ ] **TC-ADM-01: Login Barbiere & Protezione Brute Force**
  - Navigare su `/admin/login`.
  - Inserire un PIN errato per 5 volte consecutive: verificare il blocco temporaneo antintrusione.
  - Inserire il PIN corretto (`7788` o valore da env): verificare l'accesso alla dashboard e l'emissione del cookie crittografico HMAC.
- [ ] **TC-ADM-02: Barriera di Sicurezza Server Actions**
  - Tentare di invocare via curl/fetch una Server Action protetta (es. `updateAdminSettings` o `getAllClientInternalNotes`) senza cookie di sessione: verificare che restituisca errore 401 e blocchi l'esecuzione.
- [ ] **TC-ADM-03: Vista Agenda (Giorno / Mese / Anno)**
  - Nella dashboard `/admin`, verificare la visualizzazione degli appuntamenti della giornata.
  - Alternare tra vista Giorno, Mese e Anno: verificare la corretta aggregazione degli orari.
- [ ] **TC-ADM-04: Blocco Rapido Slot (Pausa / Impegno)**
  - Dalla vista giorno, cliccare sul lucchetto per bloccare un orario (es. 13:00 - 13:30).
  - Tornare lato cliente (`/book` o `/chat`): verificare che l'orario bloccato risulti immediatamente non disponibile.
  - Tornare in admin e sbloccare lo slot: verificare il ripristino istantaneo della disponibilità.
- [ ] **TC-ADM-05: Inserimento Rapido al Banco / Telefonico**
  - Cliccare su *Nuovo Appuntamento Rapido* in alto.
  - Inserire nome "Mario Rossi", telefono fittizio e orario.
  - Salvare: verificare l'inserimento senza OTP con tariffa e durata corrette.
- [ ] **TC-ADM-06: Evasione Appuntamenti & Accredito Punti**
  - Cliccare su *Completa Appuntamento* per un cliente.
  - Verificare che lo stato diventi `completed`, il pagamento `paid` e che il contatore punti fedeltà del cliente aumenti di +1.
- [ ] **TC-ADM-07: Gestione No-Show & Blocco Automatico**
  - Segnare per 3 volte appuntamenti fittizi con lo stesso numero come `no_show`.
  - Tentare una prenotazione online con quel numero: verificare la comparsa del messaggio di blocco e l'invito al contatto telefonico.
  - Dalla lista clienti in admin, cliccare su *Sana / Riabilita No-Show*: verificare lo sblocco immediato delle prenotazioni online.
- [ ] **TC-ADM-08: Registrazione Ferie & Chiusure Straordinarie**
  - Cliccare su *Ferie & Chiusure*: inserire un intervallo di 3 giorni di ferie (es. dal 1° al 3 del mese prossimo).
  - Verificare che tutte le 3 date vengano segnate come chiuse e che i relativi slot vengano rimossi lato cliente.
  - Rimuovere il periodo di ferie: verificare il ripristino degli orari lavorativi standard.
- [ ] **TC-ADM-09: Sincronizzazione iCal Privata**
  - Cliccare su *Sincronizza Calendario Telefono (iCal)*.
  - Verificare che il link generato contenga il parametro `?token=...`.
  - Provare ad aprire l'URL `/api/calendar/ical` senza il token: verificare la risposta `401 Unauthorized`.
  - Aprire l'URL con `?token=...`: verificare il download del file `.ics` con la lista formattata degli appuntamenti.
- [ ] **TC-ADM-10: Allarmi Sonori Urgente in Cassa**
  - Con la dashboard admin aperta, simulare lato cliente una disdetta con meno di 2 ore di preavviso.
  - Verificare la comparsa immediata dell'allerta rossa con sirena acustica Web Audio e il pulsante di presa in carico rapida WhatsApp.
