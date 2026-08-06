# SafeBand

NFC-Armband mit Notfallprofil. Der Chip trägt nur eine kurze URL – alle Daten liegen in
Supabase und lassen sich jederzeit ändern, ohne das Band anzufassen.

## Wie der Ablauf funktioniert

**Produktion (im Voraus, unabhängig von Bestellungen)**
Unter `/admin.html` einen Vorrat an Codes erzeugen, die Chips mit der jeweiligen URL
beschreiben und schreibschützen, dann ins Lager legen. Die Bänder sind zu diesem Zeitpunkt
noch keinem Menschen zugeordnet.

Auf einen Chip gehört ausschliesslich die Band-URL `/n/CODE` aus der Tabelle in `/admin.html` –
sonst nichts. Der Verwaltungslink `/verwalten.html?t=…` ist etwas völlig anderes: privat,
persönlich und mit vollem Lese- und Schreibzugriff auf das Profil. Landet er auf einem Band,
kann ihn jede Person mit einem Handy scannen und die Kontaktdaten einsehen und ändern.

**Bestellung**
Auf `/bestellen.html` wählt der Kunde Ausführung und Menge und gibt seine Lieferadresse an. Die
Seite ersetzt im Rahmen der Projektarbeit den Shop: Sie löst keine Zahlung aus, speichert die
Adresse nicht und erzeugt die Bestellnummer im Browser. Danach landet der Käufer auf
`/einrichten.html?bestellung=SB-10427`. Er trägt die Daten ein und bestätigt die
Datenschutzerklärung. Im Hintergrund entsteht ein Profil plus ein Einwilligungsnachweis. Der
Kunde bekommt seinen persönlichen Verwaltungslink – der bleibt bei ihm und hat mit dem Band
nichts zu tun.

**Versand**
Beim Verpacken den Code des Bandes mit NFC Tools auslesen (Reiter „Lesen"), die angezeigte
Adresse in `/admin.html` ins Feld „Band-Code oder gescannte Adresse" einfügen – der Code wird
automatisch herausgelesen –, die offene Bestellung wählen, zuordnen. Ab diesem Moment zeigt das
Band auf das Profil. Der Kunde packt aus, tippt drauf, es läuft.

Das Auslesen über NFC Tools ist bewusst der empfohlene Weg: Es braucht keine Verbindung und
zählt nicht gegen die Missbrauchssperre. Hält man das Band stattdessen ans gesperrte iPhone und
tippt das Banner an, öffnet Safari die Notfallseite mit „nicht gefunden" – korrekt, denn das Band
hat noch kein Profil. Diese Fehlgriffe sind aber auf 20 pro 10 Minuten und IP begrenzt, weshalb
das Verpacken einer grösseren Charge auf diesem Weg mittendrin blockiert.

**Notfall**
Ein Helfer hält das Handy ans Band und landet auf `/n/CODE`. Er sieht Vorname, Kategorie und
die freigegebenen Hinweise – Telefonnummer und Name des Notfallkontakts nie. Über das Formular
setzt er eine Meldung ab.

## Einrichtung

### 1. Supabase-Projekt

Projekt anlegen, als Region **Frankfurt (eu-central-1)** oder **Zürich** wählen – bei
Gesundheitsdaten sollten die Server in der EU/Schweiz stehen.

Dann die Dateien in `supabase/migrations/` im SQL-Editor ausführen, in der Reihenfolge ihrer
Nummerierung: `0001_init.sql`, `0002_lock_down_writes.sql`, `0003_contact_call.sql`,
`0004_fix_consent_scopes.sql`.

Die Migration legt am Ende einen Demo-Datensatz an: Band `DEMO0001` mit dem Profil „Luca" und
einem erfundenen Notfallkontakt. Damit lässt sich `/n/DEMO0001` sofort ausprobieren. Vor dem
Livegang gehört er gelöscht:

```sql
delete from public.profiles p using public.bands b
where b.profile_id = p.id and b.code = 'DEMO0001';
delete from public.bands where code = 'DEMO0001';
```

### 2. Admin-Konto

Unter *Authentication → Users* einen Benutzer anlegen und ihn freischalten:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'deine@adresse.ch';
```

E-Mail-Registrierung anschliessend unter *Authentication → Providers* abschalten, damit sich
niemand selbst ein Konto anlegen kann.

### 3. Konfiguration

In `js/config.js` eintragen:

| Wert | Woher |
|------|-------|
| `SUPABASE_URL` | Project Settings → Data API → Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key (`sb_publishable_…`) |
| `BAND_URL_ORIGIN` | die endgültige Domain, aktuell `https://www.safeband.ch` – sie landet unveränderbar auf den Chips |
| `PRIVACY_POLICY_VERSION` | bei jeder inhaltlichen Änderung an `datenschutz.html` hochzählen |

`BAND_URL_ORIGIN` muss stimmen, **bevor** Chips beschrieben werden: die Chips werden
schreibgeschützt, ihre Adresse lässt sich danach nicht mehr korrigieren. Eine Charge, die mit
einer Vercel-Vorschauadresse gebrannt wurde, ist nach dem Domain-Umzug wertlos.

Den Secret Key (`sb_secret_…`) niemals ins Frontend schreiben – er umgeht Row Level Security.
Ältere Projekte nutzen statt der beiden neuen Schlüssel noch `anon` und `service_role`; der
`anon`-Key funktioniert an dieser Stelle genauso.

Die Supabase-Bibliothek ist in den HTML-Dateien auf eine feste Version genagelt und mit einem
Integritäts-Hash abgesichert. Bei einem Update müssen Version und Hash gemeinsam getauscht werden:

```bash
curl -sfL https://cdn.jsdelivr.net/npm/@supabase/supabase-js@VERSION/dist/umd/supabase.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

### 4. Deployment

Statisches Hosting, Konfiguration liegt für beide Anbieter bei: `netlify.toml` oder
`vercel.json`. Beide setzen das Rewrite von `/n/CODE` auf die Notfallseite und die
`noindex`-Header für alle Seiten mit Personendaten.

## Chips beschreiben

Standardweg ist das iPhone mit der App **NFC Tools** (kostenlos, iOS 13+ ab iPhone 7). Pro Band:

1. In `/admin.html` beim gewünschten Code auf **„URL kopieren"** tippen.
2. NFC Tools → **Schreiben** → **Eine Aufzeichnung hinzufügen** → **URL / URI**, Adresse
   einfügen, **OK**.
3. **Schreiben** antippen und das Band an das obere Ende der iPhone-Rückseite halten.
4. Gegenlesen: App schliessen, Band nochmals anhalten. Es muss ein Banner mit
   `www.safeband.ch` erscheinen, das auf die Notfallseite führt.
5. Erst dann sperren: NFC Tools → **Sonstige** → **Tag sperren**.

Jedes Band bekommt seine eigene Adresse – zwei Chips mit derselben URL zeigen auf dasselbe
Profil.

Schritt 4 vor Schritt 5 ist der Grund, warum die Reihenfolge in der Anleitung steht: Ein falsch
beschriebener Chip lässt sich nach dem Sperren nicht mehr korrigieren und ist Ausschuss.
Umgekehrt ist der Schreibschutz kein optionaler Feinschliff – ein offener Chip lässt sich von
jedem Passanten mit einem Handy überschreiben.

**Alternativen.** In Chrome auf Android blendet `/admin.html` pro Zeile zusätzlich „Auf Chip
schreiben" ein und erledigt Schreiben und Sperren in einem Durchgang. Für grössere Mengen die
CSV herunterladen und mit einem USB-Encoder in einem Durchgang bespielen.

Empfohlene Hardware: **NTAG213** (144 Byte, reicht für die URL) oder NTAG215, wenn ihr später
mehr unterbringen wollt.

## Datenschutz

Der medizinische Hinweis ist ein Gesundheitsdatum nach Art. 9 DSGVO und braucht eine eigene,
ausdrückliche Einwilligung – deshalb ist sie im Formular vom allgemeinen Häkchen getrennt und
wird in `consents` mit Zeitstempel und Textversion protokolliert.

Weitere Schutzmassnahmen im Code:

- Band-Codes sind zufällig (Crockford-Base32, 32^8 Möglichkeiten) und damit nicht durchzählbar.
- Der Browser kommt nur über SECURITY-DEFINER-Funktionen an Daten. Name und Telefonnummer des
  Notfallkontakts liefert die Datenbank nur aus, wenn der Kunde sie ausdrücklich freigegeben hat,
  sonst kommen beide Felder als NULL zurück. Die E-Mail-Adresse nie.
- Wiederholte Fehlversuche werden pro IP gedrosselt (`rate_limits`).
- Kunden können ihr Band über den Verwaltungslink jederzeit selbst sperren.

Vor dem Livegang braucht ihr zusätzlich einen Auftragsverarbeitungsvertrag mit Supabase
(steht dort im Dashboard zur Verfügung) und ein Löschkonzept für gekündigte Bänder.

## Noch offen

- **Benachrichtigung der Notfallkontakte.** Helfer-Meldungen landen aktuell in
  `helper_messages`, es geht noch keine E-Mail oder SMS raus. Dafür braucht es eine Supabase
  Edge Function mit einem Trigger auf der Tabelle (Resend oder Twilio).
- **Shop-Anbindung.** `/bestellen.html` bildet den Ablauf nur nach. Am schnellsten wäre ein
  Stripe Payment Link mit Weiterleitung auf `/einrichten.html?bestellung={CHECKOUT_SESSION_ID}`.
  Sauberer ist ein Webhook, der die Bestellung vorab anlegt, damit Bestellnummern nicht
  abtippbar sind.
- **Bestätigungsmail mit dem Verwaltungslink.** Steht bisher nur auf der Erfolgsseite.
- **Kontaktformular auf der Startseite** schreibt noch in `localStorage` und verschickt nichts.
