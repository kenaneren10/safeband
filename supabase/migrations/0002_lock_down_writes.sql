-- SafeBand – Tabellenrechte für `anon` entziehen
--
-- Ausgangslage: 0001 aktiviert RLS und legt bewusst keine Policy für `anon` an.
-- Supabase vergibt neuen Tabellen im Schema `public` aber per Default-Privileg
-- automatisch GRANT ALL an `anon`. RLS fängt das bisher ab – INSERT scheitert an
-- der fehlenden Policy, UPDATE/DELETE treffen null Zeilen und liefern 204.
--
-- Damit hängt die Sicherheit an einer einzigen Schicht. Fällt eine Policy
-- versehentlich zu weit aus oder wird RLS an einer Tabelle deaktiviert, stünde
-- der öffentliche Key sofort schreibend auf den Daten. Die Grants gehören
-- deshalb weg: `anon` braucht keinen einzigen direkten Tabellenzugriff, die
-- Webseite läuft ausschliesslich über die SECURITY-DEFINER-Funktionen. Die
-- laufen unter dem Eigentümer der Funktion und sind von diesen Grants nicht
-- betroffen.
--
-- `authenticated` behält seine Rechte – die Admin-Policies aus 0001 setzen sie
-- voraus.

revoke all on all tables in schema public from anon;

-- Ohne das bekäme jede künftig angelegte Tabelle die Grants sofort wieder.
-- Gilt für die Rolle, die dieses Skript ausführt – im SQL-Editor ist das
-- `postgres`, also genau die Rolle, unter der die Tabellen entstehen.
alter default privileges in schema public revoke all on tables from anon;

-- Sequenzen sind ohne Tabellenzugriff nutzlos, hängen aber am selben Default.
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Die Funktions-Grants aus 0001 bleiben unangetastet: `anon` ruft weiterhin
-- get_public_profile, create_profile, submit_helper_message und die
-- Token-Funktionen auf.
