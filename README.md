# SupprimerNuancesInutilisees.jsx

**FR** — Détecte et supprime les nuances (swatches) inutilisées d’un document Adobe Illustrator, avec analyse préalable et options prudentes.

**EN** — Detects and removes unused swatches from an Adobe Illustrator document, with a prior analysis step and cautious options.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Cible / Target** | Illustrator CC 2018–2026 |
| **Statut de test** | **non testé dans Illustrator** (syntaxe ES3 vérifiée avec acorn) |
| **Test status** | **not tested in Illustrator** (ES3 syntax checked with acorn) |
| **Licence** | MIT — © 2026 Amirouche Amwanes |

## Installation

1. Téléchargez `SupprimerNuancesInutilisees.jsx`.
2. Dans Illustrator : **Fichier > Scripts > Autre script…** et choisissez le fichier.
3. Ou copiez-le dans le dossier Presets/Scripts d’Illustrator, puis relancez l’application (le script apparaîtra dans le menu Scripts).

**EN** — Download the `.jsx`, then **File > Scripts > Other Script…**, or copy it into Illustrator’s Presets/Scripts folder and restart.

## Usage

1. Ouvrez un document (sinon un message clair s’affiche).
2. Choisissez la langue (FR/EN) dans le dialogue.
3. Cochez les options prudentes (cochées par défaut quand pertinent) :
   - Conserver `[Sans]` / `[None]` et `[Repérage]` / `[Registration]`
   - Conserver les tons directs (spot) même s’ils semblent inutilisés
   - Conserver les nuances dans des groupes de nuances **nommés**
   - Conserver les nuances de motif (détection d’usage limitée)
4. **Analyser** : compte utilisées vs inutilisées et affiche un aperçu des candidates à supprimer — **sans modifier** le document.
5. **Appliquer** : supprime les nuances inutilisées en **une seule opération annulable** (`beginUndoGroup` / `endUndoGroup`).
6. Un résumé final indique le nombre de nuances supprimées / conservées.

Conseil : travaillez sur une **copie** du fichier. Aucune connexion réseau, aucune collecte de données. Portée : `document.swatches` du document actif uniquement.

**EN** — Open a document, pick FR/EN, review cautious options, click **Analyze** (read-only), then **Apply** (single undoable operation). Work on a copy. Scope: active document swatches only.

## Détection d’usage / Usage detection

Approche pragmatique ES3 :

- Parcourt les `pageItems` (calques et sous-calques) : fonds et contours `RGBColor` / `CMYKColor` / `GrayColor` / `LabColor` / `SpotColor` / `GradientColor`.
- Textes : attributs de caractères (plafond de 5000 caractères par bloc pour rester raisonnable).
- Tons directs : comparaison via `SpotColor.spot.name`.
- Couleurs process : signature des composants ou correspondance avec tolérance faible.
- Dégradés : noms de dégradés référencés + couleurs des stops.

### Limites documentées

- Motifs (`PatternColor`), styles graphiques, Aspect multi-fonds/contours, symboles non développés : **non parcourus en profondeur**.
- Une nuance process peut être marquée « utilisée » si une couleur du document matche ses composants, même si elle n’a pas été appliquée via le nuancier.
- Les nuances de motif sont conservées par défaut (option).

## Fichiers du dépôt

- `SupprimerNuancesInutilisees.jsx` — script autonome ExtendScript (ES3)
- `README.md` — cette documentation
- `LICENSE` — MIT
- `.gitignore`

## Idées suivantes

Renommage des objets/groupes, export @1x/@2x, remplacer les polices, extraction des couleurs utilisées vers un nuancier dédié.
