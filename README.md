# SafeBand

NFC-Armband mit Notfallprofil. Der Chip trägt nur eine kurze URL – alle Daten liegen in
Supabase und lassen sich jederzeit ändern, ohne das Band anzufassen.

## Wie der Ablauf funktioniert

**Produktion (im Voraus, unabhängig von Bestellungen)**
Unter `/admin.html` einen Vorrat an Codes erzeugen, die Chips mit der jeweiligen URL
beschreiben und schreibschützen, dann ins Lager legen. Die Bänder sind zu diesem Zeitpunkt
noch keinem Menschen zugeordnet.

**Bestellung**
Auf `/bestellen.html` wählt der Kunde Ausführung und Menge und gibt seine Lieferadresse an. Die
Seite ersetzt im Rahmen der Projektarbeit den Shop: Sie löst keine Zahlung aus, speichert die
Adresse nicht und erzeugt die Bestellnummer im Browser. Danach landet der Käufer auf
`/einrichten.html?bestellung=SB-10427`. Er trägt die Daten ein und bestätigt die
Datenschutzerklärung. Im Hintergrund entsteht ein Profil plus ein Einwilligungsnachweis. Der
Kunde bekommt einen Verwaltungslink.

**Versand**
Beim Verpacken unter `/admin.html` das Band ans Handy halten (oder den Code abtippen), die
offene Bestellung wählen, zuordnen. Ab diesem Moment zeigt das Band auf das Profil. Der Kunde
packt aus, tippt drauf, es läuft.

**Notfall**
Ein Helfer hält das Handy ans Band und landet auf `/n/CODE`. Er sieht Vorname, Kategorie und
die freigegebenen Hinweise – Telefonnummer und Name des Notfallkontakts nie. Über das Formular
setzt er eine Meldung ab.

## Einrichtung

### 1. Supabase-Projekt

Projekt anlegen, als Region **Frankfurt (eu-central-1)** oder **Zürich** wählen – bei
Gesundheitsdaten sollten die Server in der EU/Schweiz stehen.

Dann `supabase/migrations/0001_init.sql` im SQL-Editor ausführen.

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
| `BAND_URL_BASE` | eure Domain plus `/n`, z. B. `https://safeband.ch/n` |
| `PRIVACY_POLICY_VERSION` | bei jeder inhaltlichen Änderung an `datenschutz.html` hochzählen |

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

**Bis ~50 Stück:** direkt in `/admin.html` über Web NFC (nur Chrome auf Android). Die Seite
schreibt die URL und sperrt den Chip anschliessend.

**Grössere Mengen:** CSV in `/admin.html` herunterladen und mit einem USB-Encoder in einem
Durchgang bespielen.

Empfohlene Hardware: **NTAG213** (144 Byte, reicht für die URL) oder NTAG215, wenn ihr später
mehr unterbringen wollt.

Der Schreibschutz ist kein optionaler Feinschliff: ein offener Chip lässt sich von jedem
Passanten mit einem Handy überschreiben.

## Datenschutz

Der medizinische Hinweis ist ein Gesundheitsdatum nach Art. 9 DSGVO und braucht eine eigene,
ausdrückliche Einwilligung – deshalb ist sie im Formular vom allgemeinen Häkchen getrennt und
wird in `consents` mit Zeitstempel und Textversion protokolliert.

Weitere Schutzmassnahmen im Code:

- Band-Codes sind zufällig (Crockford-Base32, 32^8 Möglichkeiten) und damit nicht durchzählbar.
- Der Browser kommt nur über SECURITY-DEFINER-Funktionen an Daten; Kontaktdaten werden von der
  Datenbank gar nicht erst ausgeliefert.
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
