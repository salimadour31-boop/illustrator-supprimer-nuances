//@target illustrator
/*
 * SupprimerNuancesInutilisees.jsx  —  v1.0.0
 * ----------------------------------------------------------------------------
 * FR : Détecte et supprime les nuances (swatches) inutilisées du document
 *      Illustrator. Le bouton « Analyser » compte et liste d'abord les nuances
 *      utilisées vs inutilisées sans rien modifier ; « Appliquer » les
 *      supprime. Options prudentes : conserver [Sans]/[None] et
 *      [Repérage]/[Registration], conserver les tons directs (spot),
 *      conserver les nuances dans des groupes nommés.
 * EN : Detects and removes unused swatches from the Illustrator document.
 *      "Analyze" first counts and lists used vs unused without changing
 *      anything; "Apply" removes them. Cautious options: keep [None]/[Sans]
 *      and [Registration]/[Repérage], keep spot colors, keep swatches that
 *      belong to named swatch groups.
 *
 * Cible / Target : Illustrator CC (2018+) jusqu'aux versions récentes.
 * Statut / Status : NON TESTÉ DANS ILLUSTRATOR — syntaxe ES3 vérifiée (acorn).
 *                   NOT TESTED IN ILLUSTRATOR — ES3 syntax checked (acorn).
 * Annulation / Undo : une seule opération annulable (beginUndoGroup).
 *                     single undoable operation (beginUndoGroup).
 * Conseil : travaillez sur une copie de votre fichier.
 * Tip     : work on a copy of your file.
 * Aucune connexion réseau, aucune collecte de données.
 * No network access, no data collection.
 *
 * Limites de détection / Detection limits :
 * - Les nuances process sont marquées utilisées si une couleur fond/contour
 *   du document correspond (composants, tolérance faible).
 *   Process swatches are marked used if a document fill/stroke matches
 *   (components, small tolerance).
 * - Les tons directs : SpotColor.spot.name.
 *   Spot colors: SpotColor.spot.name.
 * - Les dégradés : stops (SpotColor ou process).
 *   Gradients: stops (SpotColor or process).
 * - Motifs, styles graphiques, Aspect multi-fonds, symboles non ouverts :
 *   non parcourus en profondeur (approche pragmatique ES3).
 *   Patterns, graphic styles, multi-fill Appearance, unopened symbols:
 *   not deeply scanned (pragmatic ES3 approach).
 *
 * Licence MIT — (c) 2026 Amirouche Amwanes. Code original.
 */

(function () {

    var VERSION = "1.0.0";
    var COLOR_TOLERANCE = 0.5; // tolérance composants process / process component tolerance

    // ------------------------------------------------------------------
    // Langue de l'interface / UI language
    // ------------------------------------------------------------------
    var FR = String($.locale || "").toLowerCase().indexOf("fr") === 0;
    function t(fr, en) { return FR ? fr : en; }

    // ------------------------------------------------------------------
    // Garde-fous / Guards
    // ------------------------------------------------------------------
    if (app.documents.length === 0) {
        alert(t("Aucun document ouvert.\nOuvrez un document puis relancez le script.",
                "No document open.\nOpen a document and run the script again."));
        return;
    }

    var doc = app.activeDocument;

    // ------------------------------------------------------------------
    // Utilitaires / Utilities
    // ------------------------------------------------------------------
    function safe(fn, fallback) {
        try { return fn(); } catch (e) { return fallback; }
    }

    function copyCollection(col) {
        var a = [];
        var i;
        for (i = 0; i < col.length; i++) { a.push(col[i]); }
        return a;
    }

    function abs(n) { return n < 0 ? -n : n; }

    function nearlyEqual(a, b, tol) {
        return abs(a - b) <= tol;
    }

    // Noms spéciaux système (FR + EN) / System reserved names (FR + EN)
    function isNoneName(name) {
        var n = String(name || "").toLowerCase();
        return n === "[none]" || n === "[sans]" || n === "none" || n === "sans";
    }

    function isRegistrationName(name) {
        var n = String(name || "").toLowerCase();
        return n === "[registration]" || n === "[repérage]" || n === "[reperage]" ||
               n === "registration" || n === "repérage" || n === "reperage";
    }

    function isProtectedSystemName(name) {
        return isNoneName(name) || isRegistrationName(name);
    }

    // ------------------------------------------------------------------
    // Signature de couleur process / Process color signature
    // ------------------------------------------------------------------
    function processKeyFromColor(col) {
        if (!col) { return null; }
        var typ = safe(function () { return col.typename; }, "");
        if (typ === "RGBColor") {
            return "RGB:" +
                Math.round(col.red) + "," +
                Math.round(col.green) + "," +
                Math.round(col.blue);
        }
        if (typ === "CMYKColor") {
            return "CMYK:" +
                Math.round(col.cyan) + "," +
                Math.round(col.magenta) + "," +
                Math.round(col.yellow) + "," +
                Math.round(col.black);
        }
        if (typ === "GrayColor") {
            return "GRAY:" + Math.round(col.gray);
        }
        if (typ === "LabColor") {
            return "LAB:" +
                Math.round(col.l) + "," +
                Math.round(col.a) + "," +
                Math.round(col.b);
        }
        return null;
    }

    function processKeyFromSwatchColor(col) {
        return processKeyFromColor(col);
    }

    function colorsMatchLoose(a, b, tol) {
        if (!a || !b) { return false; }
        var ta = safe(function () { return a.typename; }, "");
        var tb = safe(function () { return b.typename; }, "");
        if (ta !== tb) { return false; }
        if (ta === "RGBColor") {
            return nearlyEqual(a.red, b.red, tol) &&
                   nearlyEqual(a.green, b.green, tol) &&
                   nearlyEqual(a.blue, b.blue, tol);
        }
        if (ta === "CMYKColor") {
            return nearlyEqual(a.cyan, b.cyan, tol) &&
                   nearlyEqual(a.magenta, b.magenta, tol) &&
                   nearlyEqual(a.yellow, b.yellow, tol) &&
                   nearlyEqual(a.black, b.black, tol);
        }
        if (ta === "GrayColor") {
            return nearlyEqual(a.gray, b.gray, tol);
        }
        if (ta === "LabColor") {
            return nearlyEqual(a.l, b.l, tol) &&
                   nearlyEqual(a.a, b.a, tol) &&
                   nearlyEqual(a.b, b.b, tol);
        }
        return false;
    }

    // ------------------------------------------------------------------
    // Collecte des couleurs utilisées / Collect used colors
    // ------------------------------------------------------------------
    function UsedSet() {
        this.spotNames = {};   // spot name -> true
        this.processKeys = {}; // signature -> true
        this.processColors = []; // actual color objects for loose match
        this.gradientNames = {}; // gradient name -> true
    }

    UsedSet.prototype.markSpot = function (name) {
        if (name) { this.spotNames[String(name)] = true; }
    };

    UsedSet.prototype.markProcess = function (col) {
        var key = processKeyFromColor(col);
        if (key) {
            this.processKeys[key] = true;
            this.processColors.push(col);
        }
    };

    UsedSet.prototype.markGradientName = function (name) {
        if (name) { this.gradientNames[String(name)] = true; }
    };

    UsedSet.prototype.hasSpot = function (name) {
        return !!this.spotNames[String(name)];
    };

    UsedSet.prototype.hasProcess = function (col) {
        var key = processKeyFromSwatchColor(col);
        if (key && this.processKeys[key]) { return true; }
        var i;
        for (i = 0; i < this.processColors.length; i++) {
            if (colorsMatchLoose(col, this.processColors[i], COLOR_TOLERANCE)) {
                return true;
            }
        }
        return false;
    };

    UsedSet.prototype.hasGradient = function (name) {
        return !!this.gradientNames[String(name)];
    };

    function markColor(used, col) {
        if (!col) { return; }
        var typ = safe(function () { return col.typename; }, "");
        if (typ === "SpotColor") {
            var spot = safe(function () { return col.spot; }, null);
            if (spot) {
                used.markSpot(safe(function () { return spot.name; }, ""));
            }
            return;
        }
        if (typ === "GradientColor") {
            markGradient(used, col);
            return;
        }
        if (typ === "PatternColor") {
            // Motif : on ne peut pas facilement extraire les couleurs ES3
            // Pattern: colors not easily extractable in ES3 — skip deep scan
            return;
        }
        if (typ === "NoColor") { return; }
        used.markProcess(col);
    }

    function markGradient(used, gradColor) {
        var grad = safe(function () { return gradColor.gradient; }, null);
        if (!grad) { return; }
        used.markGradientName(safe(function () { return grad.name; }, ""));
        var stops = safe(function () { return grad.gradientStops; }, null);
        if (!stops) { return; }
        var i, stop, c;
        for (i = 0; i < stops.length; i++) {
            stop = stops[i];
            c = safe(function () { return stop.color; }, null);
            markColor(used, c);
        }
    }

    function markItemAppearance(used, item) {
        // Fond / Fill
        if (safe(function () { return item.filled; }, false)) {
            markColor(used, safe(function () { return item.fillColor; }, null));
        }
        // Contour / Stroke
        if (safe(function () { return item.stroked; }, false)) {
            markColor(used, safe(function () { return item.strokeColor; }, null));
        }
    }

    function scanTextFrame(used, tf) {
        // Couleurs au niveau du TextFrame (fallback)
        // TextFrame-level colors (fallback)
        markItemAppearance(used, tf);
        // Parcourir characters si possible (peut être lent sur longs textes)
        // Walk characters when possible (can be slow on long text)
        var chars = safe(function () { return tf.characters; }, null);
        if (!chars || chars.length === 0) { return; }
        var maxChars = 5000; // plafond pragmatique / pragmatic cap
        var n = chars.length < maxChars ? chars.length : maxChars;
        var i, ch, atr;
        for (i = 0; i < n; i++) {
            ch = chars[i];
            atr = safe(function () { return ch.characterAttributes; }, null);
            if (!atr) { continue; }
            markColor(used, safe(function () { return atr.fillColor; }, null));
            markColor(used, safe(function () { return atr.strokeColor; }, null));
        }
    }

    function scanPageItem(used, item) {
        var type = safe(function () { return item.typename; }, "");
        var i, kids;

        if (type === "GroupItem") {
            kids = safe(function () { return item.pageItems; }, null);
            if (kids) {
                for (i = 0; i < kids.length; i++) {
                    scanPageItem(used, kids[i]);
                }
            }
            return;
        }

        if (type === "CompoundPathItem") {
            kids = safe(function () { return item.pathItems; }, null);
            if (kids) {
                for (i = 0; i < kids.length; i++) {
                    scanPageItem(used, kids[i]);
                }
            }
            return;
        }

        if (type === "PathItem") {
            markItemAppearance(used, item);
            return;
        }

        if (type === "TextFrame") {
            scanTextFrame(used, item);
            return;
        }

        // Mesh, Plugin, Raster, SymbolItem, PlacedItem, GraphItem…
        // Essayer fill/stroke génériques si exposés
        // Try generic fill/stroke when exposed
        markItemAppearance(used, item);
    }

    function scanDocument(used) {
        var layers = doc.layers;
        var i, j, layer, items;
        for (i = 0; i < layers.length; i++) {
            scanLayer(used, layers[i]);
        }
        // Dégradés du document (au cas où référencés autrement)
        // Document gradients (in case referenced elsewhere)
        var grads = safe(function () { return doc.gradients; }, null);
        if (grads) {
            for (i = 0; i < grads.length; i++) {
                var stops = safe(function () { return grads[i].gradientStops; }, null);
                if (!stops) { continue; }
                for (j = 0; j < stops.length; j++) {
                    markColor(used, safe(function () { return stops[j].color; }, null));
                }
            }
        }
    }

    function scanLayer(used, layer) {
        var i, items, subs;
        items = safe(function () { return layer.pageItems; }, null);
        if (items) {
            for (i = 0; i < items.length; i++) {
                scanPageItem(used, items[i]);
            }
        }
        subs = safe(function () { return layer.layers; }, null);
        if (subs) {
            for (i = 0; i < subs.length; i++) {
                scanLayer(used, subs[i]);
            }
        }
    }

    // ------------------------------------------------------------------
    // Analyse des nuances / Swatch analysis
    // ------------------------------------------------------------------
    function getSwatchSpotName(sw) {
        var col = safe(function () { return sw.color; }, null);
        if (!col) { return null; }
        if (safe(function () { return col.typename; }, "") !== "SpotColor") { return null; }
        return safe(function () { return col.spot.name; }, null);
    }

    function isSpotSwatch(sw) {
        var col = safe(function () { return sw.color; }, null);
        if (!col) { return false; }
        var typ = safe(function () { return col.typename; }, "");
        if (typ === "SpotColor") { return true; }
        // SpotColorType via Spot si disponible
        var spot = safe(function () { return col.spot; }, null);
        if (spot) {
            var ct = safe(function () { return spot.colorType; }, null);
            if (ct !== null && ct !== undefined) {
                try {
                    if (ct == ColorModel.SPOT) { return true; }
                } catch (e) {}
            }
        }
        return false;
    }

    function isGradientSwatch(sw) {
        var col = safe(function () { return sw.color; }, null);
        return col && safe(function () { return col.typename; }, "") === "GradientColor";
    }

    function isPatternSwatch(sw) {
        var col = safe(function () { return sw.color; }, null);
        return col && safe(function () { return col.typename; }, "") === "PatternColor";
    }

    // Groupes de nuances nommés contenant cette nuance
    // Named swatch groups containing this swatch
    function swatchInNamedGroup(sw) {
        var groups = safe(function () { return doc.swatchGroups; }, null);
        if (!groups) { return false; }
        var i, g, name, members, j;
        for (i = 0; i < groups.length; i++) {
            g = groups[i];
            name = safe(function () { return g.name; }, "");
            // Le groupe par défaut est souvent "" ou "[Default Swatch Group]"
            // Default group is often "" or "[Default Swatch Group]"
            if (!name || name === "" ||
                String(name).toLowerCase().indexOf("default") >= 0 ||
                String(name).indexOf("[") === 0) {
                continue;
            }
            members = safe(function () { return g.getAllSwatches(); }, null);
            if (!members) { continue; }
            for (j = 0; j < members.length; j++) {
                if (members[j] === sw) { return true; }
                // Comparaison par nom si référence différente
                // Name compare if different reference
                if (safe(function () { return members[j].name; }, "") ===
                    safe(function () { return sw.name; }, "___")) {
                    return true;
                }
            }
        }
        return false;
    }

    function analyzeSwatches(opts) {
        var used = new UsedSet();
        scanDocument(used);

        var swatches = copyCollection(doc.swatches);
        var result = {
            total: swatches.length,
            used: [],
            unused: [],
            keptProtected: [],
            keptSpot: [],
            keptGroup: [],
            keptOther: []
        };

        var i, sw, name, spotName, col, reason, isUsed;

        for (i = 0; i < swatches.length; i++) {
            sw = swatches[i];
            name = safe(function () { return sw.name; }, "");
            col = safe(function () { return sw.color; }, null);

            // Système protégé / Protected system
            if (opts.keepSystem && isProtectedSystemName(name)) {
                result.keptProtected.push(name);
                result.used.push({ name: name, reason: "system" });
                continue;
            }

            // Spot
            spotName = getSwatchSpotName(sw);
            isUsed = false;

            if (spotName) {
                if (used.hasSpot(spotName) || used.hasSpot(name)) {
                    isUsed = true;
                }
            } else if (isGradientSwatch(sw)) {
                // Gradient swatch : utilisée si un objet référence ce dégradé (par nom)
                // Gradient swatch: used if an object references this gradient (by name)
                var gName = safe(function () { return col.gradient.name; }, name);
                if (used.hasGradient(gName) || used.hasGradient(name)) {
                    isUsed = true;
                }
            } else if (isPatternSwatch(sw)) {
                // Motifs : ne pas supprimer par défaut (difficile à détecter)
                // Patterns: do not remove by default (hard to detect)
                isUsed = false;
            } else if (col) {
                // Process color
                if (used.hasProcess(col)) {
                    isUsed = true;
                }
            }

            if (isUsed) {
                result.used.push({ name: name, reason: "used" });
                continue;
            }

            // Options de conservation / Keep options
            if (opts.keepSpots && (spotName || isSpotSwatch(sw))) {
                result.keptSpot.push(name);
                result.unused.push({ name: name, reason: "keep-spot", removable: false });
                continue;
            }

            if (opts.keepGroups && swatchInNamedGroup(sw)) {
                result.keptGroup.push(name);
                result.unused.push({ name: name, reason: "keep-group", removable: false });
                continue;
            }

            // Patterns : conserver si option (défaut on via keepPatterns implicite)
            // Keep pattern swatches when keepPatterns
            if (opts.keepPatterns && isPatternSwatch(sw)) {
                result.keptOther.push(name);
                result.unused.push({ name: name, reason: "keep-pattern", removable: false });
                continue;
            }

            result.unused.push({ name: name, reason: "unused", removable: true, swatch: sw });
        }

        return result;
    }

    function countRemovable(analysis) {
        var n = 0;
        var i;
        for (i = 0; i < analysis.unused.length; i++) {
            if (analysis.unused[i].removable) { n++; }
        }
        return n;
    }

    function formatAnalysis(analysis) {
        var removable = countRemovable(analysis);
        var kept = analysis.total - removable;
        var lines = [];
        lines.push(t("Total nuances : ", "Total swatches: ") + analysis.total);
        lines.push(t("Utilisées (détectées) : ", "Used (detected): ") + analysis.used.length);
        lines.push(t("Inutilisées candidates : ", "Unused candidates: ") + analysis.unused.length);
        lines.push(t("Supprimables (selon options) : ", "Removable (per options): ") + removable);
        lines.push(t("Conservées : ", "Kept: ") + kept);

        if (analysis.keptProtected.length) {
            lines.push(t("  — système : ", "  — system: ") + analysis.keptProtected.join(", "));
        }
        if (analysis.keptSpot.length) {
            lines.push(t("  — tons directs conservés : ", "  — spots kept: ") +
                (analysis.keptSpot.length > 8
                    ? analysis.keptSpot.slice(0, 8).join(", ") + "…"
                    : analysis.keptSpot.join(", ")));
        }
        if (analysis.keptGroup.length) {
            lines.push(t("  — dans groupes nommés : ", "  — in named groups: ") +
                (analysis.keptGroup.length > 8
                    ? analysis.keptGroup.slice(0, 8).join(", ") + "…"
                    : analysis.keptGroup.join(", ")));
        }

        lines.push("");
        lines.push(t("Aperçu des inutilisées supprimables :", "Preview of removable unused:"));
        var shown = 0;
        var i, u;
        for (i = 0; i < analysis.unused.length; i++) {
            u = analysis.unused[i];
            if (!u.removable) { continue; }
            if (shown >= 40) {
                lines.push("  … +" + (removable - shown));
                break;
            }
            lines.push("  • " + u.name);
            shown++;
        }
        if (shown === 0) {
            lines.push(t("  (aucune)", "  (none)"));
        }
        return lines.join("\n");
    }

    // ------------------------------------------------------------------
    // Suppression / Removal
    // ------------------------------------------------------------------
    function removeUnused(analysis) {
        var removed = 0;
        var failed = 0;
        var i, u, sw;
        // Supprimer de la fin vers le début pour limiter les problèmes d'index
        // Remove last-to-first to reduce index issues
        var toRemove = [];
        for (i = 0; i < analysis.unused.length; i++) {
            if (analysis.unused[i].removable) {
                toRemove.push(analysis.unused[i]);
            }
        }
        for (i = toRemove.length - 1; i >= 0; i--) {
            u = toRemove[i];
            sw = u.swatch;
            if (!sw) {
                // Retrouver par nom / find by name
                sw = safe(function () { return doc.swatches.getByName(u.name); }, null);
            }
            if (!sw) { failed++; continue; }
            try {
                sw.remove();
                removed++;
            } catch (e) {
                failed++;
            }
        }
        return { removed: removed, failed: failed };
    }

    // ------------------------------------------------------------------
    // Dialogue / Dialog (ScriptUI)
    // ------------------------------------------------------------------
    var w = new Window("dialog", t("Supprimer les nuances inutilisées", "Remove unused swatches") + " v" + VERSION);
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];

    // Sélecteur de langue / Language selector
    var pLang = w.add("group");
    pLang.alignment = ["right", "top"];
    pLang.add("statictext", undefined, t("Langue :", "Language:"));
    var ddLang = pLang.add("dropdownlist", undefined, ["Français", "English"]);
    ddLang.selection = FR ? 0 : 1;

    var tip = w.add("statictext", undefined,
        t("Conseil : travaillez sur une copie de votre fichier.\nAucune connexion réseau, aucune collecte de données.",
          "Tip: work on a copy of your file.\nNo network access, no data collection."),
        { multiline: true });
    tip.preferredSize = [420, 36];

    var pOpts = w.add("panel", undefined, t("Options prudentes", "Cautious options"));
    pOpts.orientation = "column";
    pOpts.alignChildren = ["left", "top"];
    pOpts.margins = [12, 16, 12, 10];

    var cbSystem = pOpts.add("checkbox", undefined,
        t("Conserver [Sans] / [None] et [Repérage] / [Registration]",
          "Keep [None] / [Sans] and [Registration] / [Repérage]"));
    cbSystem.value = true;

    var cbSpots = pOpts.add("checkbox", undefined,
        t("Conserver les tons directs (spot) même s'ils semblent inutilisés",
          "Keep spot colors even if they appear unused"));
    cbSpots.value = true;

    var cbGroups = pOpts.add("checkbox", undefined,
        t("Conserver les nuances appartenant à des groupes de nuances nommés",
          "Keep swatches that belong to named swatch groups"));
    cbGroups.value = true;

    var cbPatterns = pOpts.add("checkbox", undefined,
        t("Conserver les nuances de motif (détection d'usage limitée)",
          "Keep pattern swatches (limited usage detection)"));
    cbPatterns.value = true;

    var noteDoc = pOpts.add("statictext", undefined,
        t("Portée : nuances du document actif (document.swatches) uniquement.",
          "Scope: active document swatches (document.swatches) only."),
        { multiline: true });
    noteDoc.preferredSize = [400, 20];

    var resultBox = w.add("edittext", undefined,
        t("Cliquez sur « Analyser » pour compter et lister sans rien modifier.",
          "Click \"Analyze\" to count and list without changing anything."),
        { multiline: true, readonly: true });
    resultBox.preferredSize = [420, 220];

    var gBtn = w.add("group");
    gBtn.alignment = ["right", "top"];
    var bAnalyze = gBtn.add("button", undefined, t("Analyser", "Analyze"));
    var bCancel = gBtn.add("button", undefined, t("Annuler", "Cancel"), { name: "cancel" });
    var bApply = gBtn.add("button", undefined, t("Appliquer", "Apply"), { name: "ok" });

    var lastAnalysis = null;

    function readOpts() {
        return {
            keepSystem: cbSystem.value,
            keepSpots: cbSpots.value,
            keepGroups: cbGroups.value,
            keepPatterns: cbPatterns.value
        };
    }

    // Changement de langue : reconstruction légère des libellés via alerte
    // Language change: rebuild labels by closing/reopening is complex; set FR and refresh tip
    ddLang.onChange = function () {
        FR = (ddLang.selection && ddLang.selection.index === 0);
        tip.text = t("Conseil : travaillez sur une copie de votre fichier.\nAucune connexion réseau, aucune collecte de données.",
                     "Tip: work on a copy of your file.\nNo network access, no data collection.");
        cbSystem.text = t("Conserver [Sans] / [None] et [Repérage] / [Registration]",
                          "Keep [None] / [Sans] and [Registration] / [Repérage]");
        cbSpots.text = t("Conserver les tons directs (spot) même s'ils semblent inutilisés",
                         "Keep spot colors even if they appear unused");
        cbGroups.text = t("Conserver les nuances appartenant à des groupes de nuances nommés",
                          "Keep swatches that belong to named swatch groups");
        cbPatterns.text = t("Conserver les nuances de motif (détection d'usage limitée)",
                            "Keep pattern swatches (limited usage detection)");
        noteDoc.text = t("Portée : nuances du document actif (document.swatches) uniquement.",
                         "Scope: active document swatches (document.swatches) only.");
        bAnalyze.text = t("Analyser", "Analyze");
        bCancel.text = t("Annuler", "Cancel");
        bApply.text = t("Appliquer", "Apply");
        pOpts.text = t("Options prudentes", "Cautious options");
        w.text = t("Supprimer les nuances inutilisées", "Remove unused swatches") + " v" + VERSION;
        if (!lastAnalysis) {
            resultBox.text = t("Cliquez sur « Analyser » pour compter et lister sans rien modifier.",
                               "Click \"Analyze\" to count and list without changing anything.");
        } else {
            resultBox.text = formatAnalysis(lastAnalysis);
        }
    };

    bAnalyze.onClick = function () {
        try {
            lastAnalysis = analyzeSwatches(readOpts());
            resultBox.text = formatAnalysis(lastAnalysis);
        } catch (e) {
            resultBox.text = t("Erreur pendant l'analyse : ", "Error during analysis: ") + e.message;
            lastAnalysis = null;
        }
    };

    bApply.onClick = function () {
        w.close(1);
    };

    if (w.show() !== 1) { return; }

    // ------------------------------------------------------------------
    // Application réelle / Actual apply
    // ------------------------------------------------------------------
    var opts = readOpts();
    try {
        var analysis = analyzeSwatches(opts);
        var removable = countRemovable(analysis);
        if (removable === 0) {
            alert(t("Aucune nuance inutilisée à supprimer avec les options actuelles.",
                    "No unused swatches to remove with the current options.") +
                  "\n\n" + formatAnalysis(analysis));
            return;
        }

        app.beginUndoGroup(t("Supprimer nuances inutilisées", "Remove unused swatches"));
        var res;
        try {
            res = removeUnused(analysis);
        } finally {
            app.endUndoGroup();
        }
        app.redraw();

        var kept = analysis.total - res.removed;
        var msg = t("Suppression terminée.", "Removal complete.") + "\n\n" +
            t("Supprimées : ", "Removed: ") + res.removed + "\n" +
            t("Conservées : ", "Kept: ") + kept +
            (res.failed > 0 ? ("\n" + t("Échecs : ", "Failed: ") + res.failed) : "") +
            "\n\n" + t("Ctrl+Z / Cmd+Z pour annuler.", "Ctrl+Z / Cmd+Z to undo.");
        alert(msg);
    } catch (err) {
        try { app.endUndoGroup(); } catch (e2) {}
        alert(t("Erreur pendant la suppression : ", "Error during removal: ") + err.message +
              (err.line ? " (ligne/line " + err.line + ")" : "") + "\n" +
              t("Utilisez Ctrl+Z / Cmd+Z pour revenir en arrière.", "Use Ctrl+Z / Cmd+Z to go back."));
    }

}());
