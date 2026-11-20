# Pubblicare FlowLab su Google Play

L'app Android, i testi e le immagini sono già pronti. Questa guida elenca **solo i passaggi che Google permette di fare al titolare dell'account**. Vanno fatti una volta sola.

| | Cosa | Dove | Tempo |
|---|---|---|---|
| 1 | Chiave di firma nei Secrets | GitHub | 2 min |
| 2 | Compilare l'app | GitHub Actions | 5 min (automatico) |
| 3 | Configurare l'app | Play Console | 15 min |
| 4 | Test chiuso con 12 tester | Play Console | 14 giorni |
| 5 | Pubblicazione automatica (facoltativa) | Google Cloud + Play Console | 10 min |

---

## 1. Chiave di firma nei Secrets di GitHub

La chiave serve a Google per riconoscere che gli aggiornamenti arrivano da te. **Conservala in un posto sicuro**: senza la chiave non potresti più aggiornare l'app, salvo una richiesta di reset al supporto Google.

1. Apri il repository su GitHub → **Settings → Secrets and variables → Actions → New repository secret**.
2. Crea due secret:
   - Nome `ANDROID_KEYSTORE_BASE64`, valore: tutto il contenuto del file `keystore-base64.txt`.
   - Nome `ANDROID_KEYSTORE_PASSWORD`, valore: la password del file `password.txt`.

## 2. Compilare l'app

1. Su GitHub apri **Actions → App Android → Run workflow**.
2. Lascia la versione proposta, **togli la spunta a "Carica su Google Play"** (la prima volta il caricamento va fatto a mano) e premi **Run workflow**.
3. Dopo circa 5 minuti trovi `FlowLab-Android.aab` nella pagina **Releases** del repository. Nella stessa pagina c'è anche `FlowLab-Android.apk`, che puoi installare direttamente sul telefono per provare l'app.

## 3. Configurare l'app nella Play Console

### Creare l'app (se non l'hai già fatto)
**Home → Crea app**:
- Nome: `FlowLab – Flowchart e Coding`
- Lingua predefinita: Italiano
- Tipo: App, Gratuita
- Spunta le dichiarazioni e premi **Crea app**.

### Scheda dello Store
**Crescita → Presenza nello Store → Scheda dello Store principale**: copia testi e immagini da [`scheda.md`](scheda.md) e dalla cartella [`grafica/`](grafica/).

### "Configura la tua app" (dashboard)
Risposte già preparate:

| Sezione | Risposta |
|---|---|
| Norme sulla privacy | `https://rosariomarra.github.io/FlowLab/privacy.html` |
| Accesso all'app | Tutte le funzionalità sono disponibili senza limitazioni |
| Annunci | No, l'app non contiene annunci |
| Classificazione dei contenuti | Inserisci la tua email, categoria **"Tutti gli altri tipi di app"**. Rispondi **No** a tutte le domande: violenza, contenuti sessuali, linguaggio, sostanze, gioco d'azzardo, interazione tra utenti, condivisione della posizione, acquisti digitali. Risultato atteso: PEGI 3 / Tutti |
| Pubblico di destinazione | **13-15, 16-17, 18 e oltre** (scegliendo anche le fasce sotto i 13 anni si applicano i requisiti aggiuntivi del programma Famiglie) |
| App di notizie | No |
| App per la salute | Nessuna |
| Funzionalità finanziarie | L'app non offre funzionalità finanziarie |
| App governative | No |
| Sicurezza dei dati | "L'app raccoglie o condivide i tipi di dati utente richiesti?" → **No** |
| ID pubblicità | No, l'app non usa l'ID pubblicità |

## 4. Test chiuso (obbligatorio per i nuovi account personali)

Google chiede almeno **12 tester attivi per 14 giorni consecutivi** prima di permettere la pubblicazione per tutti.

1. **Test → Test chiuso → Gestisci canale (Alpha) → Tester**: crea un elenco con le email Google di almeno 12 persone e salva. Copia il **link di partecipazione** e invialo ai tester.
2. **Release → Crea nuova release**:
   - accetta la **Firma dell'app di Google Play** (impostazione consigliata);
   - carica `FlowLab-Android.aab`;
   - note di rilascio: `Prima versione di FlowLab.`
3. **Paesi/regioni**: aggiungi Italia (o tutti).
4. **Invia per la revisione**. La prima revisione richiede di solito da 1 a 7 giorni.
5. Dopo 14 giorni con almeno 12 tester: **Dashboard → Richiedi l'accesso alla produzione**.

## 5. Pubblicazione automatica (facoltativa)

Dopo questo passaggio ogni nuova versione si pubblica dalla pagina **Actions** di GitHub, senza aprire la Play Console.

1. **Google Cloud Console** (console.cloud.google.com):
   - crea un progetto, ad esempio `flowlab-play`;
   - **API e servizi → Libreria**: abilita **Google Play Android Developer API**;
   - **IAM e amministrazione → Account di servizio → Crea account di servizio** (nome `github-flowlab`, nessun ruolo);
   - apri l'account appena creato → **Chiavi → Aggiungi chiave → JSON**: viene scaricato un file `.json`.
2. **Play Console → Utenti e autorizzazioni → Invita nuovi utenti**:
   - email: quella dell'account di servizio (finisce con `iam.gserviceaccount.com`);
   - **Autorizzazioni app → aggiungi FlowLab**: spunta *Rilascia in canali di test* e *Rilascia in produzione* (oppure *Amministratore* per l'app);
   - **Invia invito**.
3. **GitHub → Settings → Secrets and variables → Actions → New repository secret**: nome `PLAY_SERVICE_ACCOUNT_JSON`, valore: tutto il contenuto del file `.json`.

Da qui in poi: **Actions → App Android → Run workflow**, scegli la versione (deve essere più alta della precedente, es. `25.0.1`) e il canale (`alpha` = test chiuso, `production` = tutti), poi premi **Run workflow**.
