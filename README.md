# WM-Tippspiel

Internes Tippspiel für die Fußball-WM. Statisches Frontend (HTML/CSS/JS) + Firebase (Auth + Firestore) als Backend. Hosting auf GitHub Pages.

## Funktionen
- Registrierung & Login per E-Mail + Passwort
- Tipps für kommende Spiele (Sperre bei Anpfiff)
- Eigene Tipps mit Punkten
- Top-5-Tabelle
- Admin-Bereich: Spiele anlegen und Ergebnisse eintragen (Punkte werden automatisch berechnet)

## Punkte
- **3 Punkte** für exakten Tipp
- **1 Punkt** für richtige Tendenz (1/X/2)
- **0 Punkte** sonst

## Setup

### 1. Firebase-Projekt anlegen
1. https://console.firebase.google.com → "Projekt hinzufügen".
2. **Authentication** aktivieren → "E-Mail/Passwort" einschalten.
3. **Firestore Database** anlegen (Startmodus: "Production").
4. Web-App registrieren (`</>`-Symbol) → Firebase-Config kopieren.

### 2. Code konfigurieren
- `firebase-config.js` öffnen und die Werte aus Schritt 1 einsetzen.
- `ADMIN_EMAIL` (in `firebase-config.js`) auf deine E-Mail-Adresse setzen.
- In `firestore.rules` denselben Wert bei `REPLACE_ME@example.com` eintragen.

### 3. Firestore-Rules veröffentlichen
- Inhalt von `firestore.rules` in die Firebase Console → Firestore → Regeln einfügen → Veröffentlichen.

### 4. Lokal testen
```
python -m http.server 8000
```
Dann http://localhost:8000 öffnen.

### 5. Auf GitHub Pages deployen
1. Dateien in ein GitHub-Repository pushen.
2. Repo → Settings → Pages → "Deploy from branch" → `main` / root → Save.
3. Domain in Firebase Console → Authentication → Settings → "Authorized domains" hinzufügen (z.B. `<user>.github.io`).

## Erster Test (End-to-End)
1. Mit Admin-E-Mail registrieren.
2. Mit zweitem Account (Kollegen-Test) registrieren.
3. Als Admin im Tab **Admin** ein Spiel mit Anpfiff in 2 Minuten anlegen.
4. Als Kollege Tipp speichern (z.B. 2:1).
5. Anpfiff-Zeit abwarten – Tipp ist gesperrt.
6. Als Admin Endergebnis eintragen (z.B. 2:1).
7. **Tabelle** prüfen: Punkte wurden vergeben (3 für exakt, 1 für Tendenz).

## Struktur
```
index.html         # SPA-Shell + Templates
style.css          # Clean, helles Theme
app.js             # Auth, Views, Tipp-Logik, Admin
firebase-config.js # Firebase-Keys + Admin-Mail
firestore.rules    # Sicherheitsregeln (in Console einfügen)
```

## Hinweise
- Firebase-Web-Keys sind nicht geheim – Sicherheit kommt aus den Firestore-Rules.
- Tipps sind privat: nur der Tippende (und der Admin) sehen sie.
- Reset einer Saison: einfach `bets`- und `matches`-Collections in der Firebase Console leeren und `users.totalPoints` zurücksetzen.
