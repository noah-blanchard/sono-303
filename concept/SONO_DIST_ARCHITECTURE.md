# SONO-DIST

## Spécification sonore, fonctionnelle et visuelle prête pour implémentation

Ce document est la source de vérité pour ajouter **SONO-DIST** au projet
**SONO-303**. Il décrit le comportement sonore, les modes de distorsion, les
réglages, l’architecture Tone.js, l’interface React et les critères de
validation.

Le nom affiché dans l’interface doit toujours être **SONO-DIST**. Ne pas afficher
`DTRONICS`, `DT-303`, `Roland`, `TB-303` ou le nom d’un produit existant comme
marque du module.

---

## 0. Contrat d’exécution pour l’agent

L’agent chargé de l’implémentation doit :

- construire le module décrit dans ce document sans élargir son périmètre ;
- conserver **une seule chaîne audio**, stable pendant toute la vie de
  l’application ;
- garder les objets Tone.js hors du rendu React ;
- implémenter des courbes de saturation différentes pour `CLASSIC`, `TURBO` et
  `O-DRIVE` ;
- implémenter `BYPASS` comme un véritable chemin audio sec, pas comme une
  distorsion réglée à zéro ;
- lisser les changements de gain, de filtre et de chemin audio afin d’éviter les
  clics ;
- protéger la sortie globale contre les niveaux dangereux ;
- préserver l’identité visuelle métallique, graphite et rouge de SONO-303 ;
- vérifier le build, le lint, la destruction des nœuds audio et les critères
  d’acceptation avant de déclarer le travail terminé.

Les mots **doit**, **obligatoire**, **ne doit pas** et **interdit** expriment des
contraintes d’implémentation.

---

## 1. Objectif du module

SONO-DIST est une pédale de distorsion virtuelle compacte placée après le moteur
de synthèse SONO-303. Son rôle est de transformer une ligne de basse déjà
générée en un signal plus chaud, plus dense ou plus agressif.

L’expérience essentielle est volontairement simple :

1. choisir un type de distorsion ;
2. régler la quantité de saturation avec `DRIVE` ;
3. assombrir ou éclaircir le résultat avec `TONE` ;
4. équilibrer le volume traité avec `LEVEL` ;
5. revenir instantanément au son original avec `BYPASS`.

Le module n’est pas une émulation électronique d’un circuit existant. Il doit
être musical, prévisible et immédiatement utile avec une séquence acid.

---

## 2. Périmètre essentiel

SONO-DIST contient exactement :

- trois potentiomètres : `DRIVE`, `TONE`, `LEVEL` ;
- trois modes sonores : `CLASSIC`, `TURBO`, `O-DRIVE` ;
- un mode `BYPASS` ;
- une LED rouge `ACTIVE` ;
- un chemin dry/wet interne sans réglage de mix exposé ;
- une connexion audio depuis SONO-303 vers SONO-DIST ;
- une sortie vers le volume maître et le limiteur de sécurité.

Il n’y a pas de bouton Power, de pédale mécanique, d’égaliseur multibande, de
simulation d’ampli, de cabinet, de réverbération ou de délai dans le MVP.

---

## 3. Architecture sonore

### 3.1 Position dans le projet

Le signal complet doit suivre cet ordre :

```text
Séquenceur 16 pas
    -> voix monophonique SONO-303
    -> sortie synthé
    -> entrée SONO-DIST
        ├── chemin sec ------------------------------------┐
        └── pré-gain -> waveshaper -> DC blocker           │
                       -> filtre TONE -> compensation       │
                       -> niveau LEVEL ---------------------┤
                                                          │
                              crossfade dry / wet <--------┘
    -> volume maître SONO-303
    -> limiteur de sécurité -1 dB
    -> Tone.Destination
```

Règle critique : la voix SONO-303 ne doit plus appeler `.toDestination()`
directement. Sinon le navigateur jouera simultanément le signal sec direct et
le signal passé dans SONO-DIST, ce qui doublera le son et rendra le bypass faux.

### 3.2 Graphe interne obligatoire

Le module doit posséder les nœuds stables suivants :

```text
Tone.Gain input
    ├── Tone.CrossFade.a                         // dry
    └── Tone.Gain preGain
          -> Tone.WaveShaper shaper
          -> Tone.Filter dcBlocker               // high-pass 20 Hz
          -> Tone.Filter toneFilter              // low-pass 650 Hz à 16 kHz
          -> Tone.Gain modeCompensation
          -> Tone.Gain levelGain
          -> Tone.CrossFade.b                     // wet

Tone.CrossFade
    -> Tone.Gain output
```

Le `CrossFade` doit recevoir :

- `fade = 0` en mode `BYPASS` : 100 % entrée `a`, donc signal sec ;
- `fade = 1` dans les trois modes actifs : 100 % entrée `b`, donc signal traité.

Le réglage `LEVEL` appartient uniquement au chemin traité. Il ne doit pas
modifier le volume en bypass. Les valeurs de `DRIVE`, `TONE` et `LEVEL` restent
toutefois mémorisées pendant le bypass.

### 3.3 Pourquoi un WaveShaper personnalisé

Ne pas représenter les trois modes avec une seule instance de
`Tone.Distortion` dont seule la quantité change. Ils deviendraient trois niveaux
du même effet.

Utiliser `Tone.WaveShaper` avec une courbe `Float32Array` propre à chaque mode.
Une table de **4096 points** est suffisante. Les entrées et sorties de la courbe
doivent rester dans `[-1, 1]` et ne contenir ni `NaN` ni `Infinity`.

Le waveshaper doit utiliser :

- `2x` d’oversampling pour `CLASSIC` ;
- `4x` pour `TURBO` ;
- `2x` pour `O-DRIVE`.

L’oversampling limite une partie de l’aliasing créé par les courbes non
linéaires. Il ne doit pas être modifié en continu pendant un mouvement de knob ;
il change uniquement lors d’un changement de mode.

---

## 4. État du module

L’état React doit être entièrement sérialisable :

```ts
export type DistortionMode =
  | "classic"
  | "turbo"
  | "overdrive"
  | "bypass";

export type SonoDistState = {
  mode: DistortionMode;
  drive: number; // normalisé, 0..1
  tone: number;  // normalisé, 0..1
  level: number; // normalisé, 0..1
};

export const defaultSonoDistState: SonoDistState = {
  mode: "classic",
  drive: 0.38,
  tone: 0.58,
  level: 0.67,
};
```

Ne pas stocker une propriété `active` séparée. Elle serait redondante et
pourrait contredire le mode. Toujours la dériver :

```ts
const active = state.mode !== "bypass";
```

Une seule valeur de mode peut être sélectionnée à la fois.

---

## 5. Les trois potentiomètres

### 5.1 DRIVE

`DRIVE` contrôle la force avec laquelle le signal frappe l’étage non linéaire.

- À gauche : peu de gain, harmoniques légères, attaque conservée.
- Au centre : saturation clairement audible et ligne de basse plus dense.
- À droite : écrêtage important, sustain apparent et acidité maximale.

`DRIVE` n’est pas un réglage dry/wet. Il agit sur deux éléments coordonnés :

1. le pré-gain placé avant le waveshaper ;
2. la sévérité de la courbe du mode actif.

Plages recommandées :

| Mode | Pré-gain à `0` | Pré-gain à `1` | Paramètre de courbe |
|---|---:|---:|---|
| CLASSIC | 0 dB | +18 dB | douceur `k = 1.0..4.5` |
| TURBO | +6 dB | +28 dB | seuil `0.78..0.22` |
| O-DRIVE | 0 dB | +22 dB | asymétrie croissante |

La conversion d’un intervalle normalisé vers des décibels est linéaire :

```ts
const lerp = (min: number, max: number, value: number) =>
  min + (max - min) * value;

const preGainDb = lerp(minDb, maxDb, drive);
const preGainLinear = Tone.dbToGain(preGainDb);
```

Le gain doit rejoindre la nouvelle valeur avec une rampe de **20 ms**. La
courbe peut être régénérée à chaque événement de changement du knob, mais jamais
à chaque frame d’animation.

### 5.2 TONE

`TONE` est un filtre passe-bas placé **après** la saturation.

- À gauche : son sombre, doux et compact.
- Au centre : son équilibré, idéal pour le mode CLASSIC.
- À droite : harmoniques hautes plus présentes, son ouvert et agressif.

Paramètres obligatoires :

- type : `lowpass` ;
- rolloff : `-12 dB/octave` ;
- Q : environ `0.7` ;
- fréquence minimale : `650 Hz` ;
- fréquence maximale : `16 000 Hz`.

La fréquence doit utiliser une interpolation exponentielle :

```ts
export function mapToneToFrequency(value: number): number {
  const minHz = 650;
  const maxHz = 16_000;
  return minHz * Math.pow(maxHz / minHz, value);
}
```

La fréquence doit rejoindre la nouvelle valeur en **20 à 30 ms**. Les trois
modes utilisent la même plage afin que le knob garde une signification stable.

### 5.3 LEVEL

`LEVEL` règle le volume de sortie du chemin traité.

- Plage : `-24 dB` à `+3 dB`.
- Valeur par défaut : `0.67`, soit environ `-5.9 dB`.
- Rampe recommandée : `20 ms`.

```ts
export function mapLevelToDb(value: number): number {
  return -24 + value * 27;
}
```

Ce réglage sert à comparer le son traité au son sec à volume raisonnablement
proche. Il ne remplace pas le volume maître de SONO-303 et n’agit pas en bypass.

---

## 6. Modes de distorsion

### 6.1 CLASSIC

**Intention sonore :** saturation chaude, ronde et progressive. Ce mode doit
épaissir la basse sans détruire immédiatement son attaque.

Caractéristiques :

- écrêtage doux et symétrique ;
- génération surtout d’harmoniques impaires ;
- dynamique encore perceptible aux faibles valeurs de DRIVE ;
- compensation interne : environ `-4 dB` ;
- oversampling : `2x`.

Courbe recommandée :

```ts
function softClip(x: number, k: number): number {
  return Math.tanh(k * x) / Math.tanh(k);
}

function classicCurve(x: number, drive: number): number {
  const k = lerp(1.0, 4.5, drive);
  return softClip(x, k);
}
```

CLASSIC est le mode par défaut.

### 6.2 TURBO

**Intention sonore :** distorsion dure, tranchante et très énergique. Ce mode
doit faire ressortir la résonance et les accents d’une séquence acid.

Caractéristiques :

- écrêtage presque dur ;
- plus de pré-gain que les autres modes ;
- transitoires comprimées et forte densité harmonique ;
- compensation interne : environ `-10 dB` ;
- oversampling : `4x`.

Courbe recommandée :

```ts
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function turboCurve(x: number, drive: number): number {
  const threshold = lerp(0.78, 0.22, drive);
  return clamp(x / threshold, -1, 1);
}
```

TURBO doit être clairement plus agressif que CLASSIC pour une même position de
DRIVE. Sa compensation de niveau est obligatoire pour éviter un saut de volume
excessif au changement de mode.

### 6.3 O-DRIVE

**Intention sonore :** overdrive asymétrique, organique et légèrement plus
grave. Il doit sonner moins brutal que TURBO et moins neutre que CLASSIC.

Caractéristiques :

- écrêtage doux asymétrique ;
- davantage d’harmoniques paires ;
- corps plus prononcé dans les bas-médiums ;
- compensation interne : environ `-6.5 dB` ;
- oversampling : `2x`.

Courbe recommandée :

```ts
function overdriveCurve(x: number, drive: number): number {
  const positiveK = lerp(1.0, 6.0, drive);
  const negativeK = lerp(0.7, 3.8, drive);

  return x >= 0
    ? 0.96 * softClip(x, positiveK)
    : 0.82 * softClip(x, negativeK);
}
```

Une courbe asymétrique peut produire une petite composante continue. C’est la
raison pour laquelle le `dcBlocker` passe-haut à `20 Hz` doit être placé juste
après le waveshaper.

### 6.4 BYPASS

**Intention sonore :** restituer le signal d’entrée original.

Comportement obligatoire :

- `CrossFade.fade` rejoint `0` en environ `20 ms` ;
- `DRIVE`, `TONE` et `LEVEL` n’affectent plus le son ;
- les valeurs des knobs restent visibles et mémorisées ;
- la LED `ACTIVE` est éteinte ;
- aucun nœud n’est détruit ;
- revenir à un mode actif réutilise immédiatement les réglages mémorisés.

Le bypass ne doit pas être simulé avec `drive = 0`, car même une courbe douce et
un filtre ouvert modifient le signal.

---

## 7. Génération des courbes

Créer un utilitaire pur dans `distortionCurves.ts` :

```ts
const CURVE_SIZE = 4096;

export function buildDistortionCurve(
  mode: Exclude<DistortionMode, "bypass">,
  drive: number,
): Float32Array {
  const safeDrive = clamp(drive, 0, 1);
  const curve = new Float32Array(CURVE_SIZE);

  for (let index = 0; index < CURVE_SIZE; index += 1) {
    const x = (index / (CURVE_SIZE - 1)) * 2 - 1;

    const shaped =
      mode === "classic"
        ? classicCurve(x, safeDrive)
        : mode === "turbo"
          ? turboCurve(x, safeDrive)
          : overdriveCurve(x, safeDrive);

    curve[index] = clamp(shaped, -1, 1);
  }

  return curve;
}
```

Tester cet utilitaire indépendamment du navigateur :

- longueur exacte de 4096 ;
- toutes les valeurs sont finies ;
- toutes les valeurs sont comprises entre `-1` et `1` ;
- l’entrée proche de zéro produit une sortie proche de zéro ;
- CLASSIC est symétrique à tolérance flottante ;
- O-DRIVE n’est volontairement pas symétrique ;
- TURBO atteint plus rapidement les limites qu’un mode CLASSIC équivalent.

---

## 8. Changement de mode sans clic

Changer instantanément une courbe pendant que le signal traverse le waveshaper
peut produire un clic. Utiliser la stratégie suivante :

### Passage vers BYPASS

1. conserver les valeurs courantes ;
2. faire une rampe de `CrossFade.fade` vers `0` sur `20 ms` ;
3. mettre à jour le mode logique ;
4. éteindre la LED dérivée.

### Passage de BYPASS vers un mode actif

1. appliquer la courbe, l’oversampling et la compensation du nouveau mode ;
2. conserver le crossfade sur le chemin sec pendant cette mise à jour ;
3. faire une rampe vers `1` sur `20 ms` ;
4. allumer la LED dérivée.

### Passage d’un mode actif vers un autre

1. faire une courte rampe vers le chemin sec sur `10 à 15 ms` ;
2. changer la courbe, l’oversampling, le pré-gain et la compensation ;
3. faire une rampe vers le chemin traité sur `20 ms`.

Les changements rapides doivent utiliser un identifiant de révision ou annuler
le timeout précédent afin qu’une ancienne transition ne réactive pas le mauvais
mode.

---

## 9. API du moteur audio

Créer une classe indépendante de React :

```ts
export type SonoDistEngineApi = {
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  setDrive(value: number): void;
  setTone(value: number): void;
  setLevel(value: number): void;
  setMode(mode: DistortionMode): void;
  setState(state: SonoDistState): void;
  connect(destination: Tone.InputNode): void;
  disconnect(): void;
  dispose(): void;
};
```

La classe concrète doit posséder une instance de chaque nœud :

```ts
export class SonoDistEngine implements SonoDistEngineApi {
  readonly input = new Tone.Gain(1);
  readonly output = new Tone.Gain(1);

  private readonly preGain = new Tone.Gain(1);
  private readonly shaper = new Tone.WaveShaper();
  private readonly dcBlocker = new Tone.Filter({
    type: "highpass",
    frequency: 20,
    Q: 0.7,
    rolloff: -12,
  });
  private readonly toneFilter = new Tone.Filter({
    type: "lowpass",
    frequency: mapToneToFrequency(0.58),
    Q: 0.7,
    rolloff: -12,
  });
  private readonly modeCompensation = new Tone.Gain(1);
  private readonly levelGain = new Tone.Gain(1);
  private readonly crossFade = new Tone.CrossFade(1);

  private state: SonoDistState = { ...defaultSonoDistState };
  private transitionRevision = 0;

  constructor() {
    this.input.connect(this.crossFade.a);
    this.input.chain(
      this.preGain,
      this.shaper,
      this.dcBlocker,
      this.toneFilter,
      this.modeCompensation,
      this.levelGain,
      this.crossFade.b,
    );
    this.crossFade.connect(this.output);
    this.setState(this.state);
  }

  // Les setters, transitions et dispose() sont à implémenter selon ce document.
}
```

Ce squelette exprime le graphe attendu ; l’agent peut ajuster une signature
Tone.js si la version installée exige une forme légèrement différente.

### 9.1 Lissage des paramètres

Utiliser des rampes courtes pour :

- `preGain.gain` : 20 ms ;
- `toneFilter.frequency` : 20 à 30 ms ;
- `levelGain.gain` : 20 ms ;
- `modeCompensation.gain` : 20 ms ;
- `crossFade.fade` : 10 à 20 ms selon la transition.

Limiter chaque entrée de setter à `[0, 1]` avant toute conversion.

### 9.2 Compensation interne par mode

La compensation est distincte du knob `LEVEL` :

```ts
const MODE_COMPENSATION_DB = {
  classic: -4,
  turbo: -10,
  overdrive: -6.5,
} as const;
```

Ces valeurs sont des points de départ, pas une normalisation automatique. Elles
peuvent être ajustées légèrement à l’oreille, mais TURBO doit toujours recevoir
la réduction la plus importante.

### 9.3 Cycle de vie

- Instancier `SonoDistEngine` une seule fois.
- Ne jamais le recréer lors d’un rendu React.
- Ne jamais recréer les nœuds lors d’un changement de mode.
- `dispose()` doit annuler toute transition en attente, déconnecter puis disposer
  chaque nœud détenu par le moteur.
- Ne pas disposer `Tone.Destination`.

---

## 10. Intégration avec SONO-303

### 10.1 Modification minimale de Sono303Engine

Le moteur principal doit exposer une sortie connectable :

```ts
type Sono303RoutingApi = {
  readonly output: Tone.Gain;
  connect(destination: Tone.InputNode): void;
  disconnect(): void;
};
```

La voix de synthèse se connecte à `Sono303Engine.output`, jamais directement à
la destination.

### 10.2 Câblage au niveau de l’application

Créer les objets une seule fois dans le hook d’intégration ou dans un petit
objet `SonoAudioRig` :

```ts
const synthEngine = new Sono303Engine();
const distEngine = new SonoDistEngine();
const masterVolume = new Tone.Gain(1);
const safetyLimiter = new Tone.Limiter(-1).toDestination();

synthEngine.connect(distEngine.input);
distEngine.output.chain(masterVolume, safetyLimiter);
```

Il ne doit exister qu’un seul chemin vers `Tone.Destination`.

Le limiteur se trouve après le module et le volume maître. Il sert uniquement de
protection contre les pics ; il ne doit pas être utilisé comme élément créatif
de la distorsion.

### 10.3 Synchronisation React

Le hook d’intégration doit :

- conserver les moteurs dans des références stables ;
- appeler `Tone.start()` uniquement après un geste utilisateur ;
- transmettre l’état SONO-DIST avec des setters impératifs ;
- ne jamais enregistrer un nœud Tone.js dans le reducer ;
- détruire les moteurs et le limiteur au démontage final.

---

## 11. Architecture de fichiers

Ajouter les fichiers suivants au projet SONO-303 :

```text
src/
├── audio/
│   ├── Sono303Engine.ts
│   ├── SonoDistEngine.ts          # Graphe audio et cycle de vie du module
│   ├── distortionCurves.ts        # Fonctions pures des trois courbes
│   └── distortionMapping.ts       # Mapping DRIVE, TONE, LEVEL, compensation
├── state/
│   ├── sono303Reducer.ts
│   └── sonoDistReducer.ts         # État sérialisable et actions du module
├── hooks/
│   └── useSono303.ts              # Câble synthé, effet, master et limiteur
├── components/
│   ├── Sono303Panel.tsx
│   ├── SonoDistPanel.tsx          # Coque et disposition complète
│   ├── DistortionModeSelector.tsx # Groupe exclusif de quatre boutons
│   └── RotaryKnob.tsx             # Composant partagé avec SONO-303
└── styles/
    ├── tokens.css
    └── sono-dist.css
```

Un reducer séparé est recommandé pour garder le module lisible. Il peut aussi
être un sous-état du reducer principal si la séparation reste nette.

Actions minimales :

```ts
type SonoDistAction =
  | { type: "dist/setMode"; mode: DistortionMode }
  | { type: "dist/setDrive"; value: number }
  | { type: "dist/setTone"; value: number }
  | { type: "dist/setLevel"; value: number };
```

---

## 12. Interface utilisateur

### 12.1 Direction visuelle

SONO-DIST doit ressembler à un module matériel crédible appartenant à la même
famille que SONO-303 :

- façade verticale en aluminium brossé froid ;
- fines lignes de séparation graphite ;
- texte noir ou graphite, technique et compact ;
- potentiomètres métalliques avec bague sombre ;
- repères radiaux fins autour des knobs ;
- petites LED rouges avec halo discret ;
- boutons rectangulaires mécaniques gris clair ;
- ombres réalistes mais modérées ;
- aucun dégradé néon, écran LCD, dashboard ou carte SaaS.

Le module peut être affiché à droite de SONO-303 sur grand écran et en dessous
sur mobile. Il doit rester visuellement séparé : deux appareils distincts,
reliés par un câble audio visible dans les vues de présentation.

### 12.2 Disposition exacte

De haut en bas :

```text
┌─────────────────────────────────┐
│ SONO-DIST                       │
│ DISTORTION MODULE         ● ACTIVE
├─────────────────────────────────┤
│    DRIVE       TONE       LEVEL │
│     ◉           ◉           ◉   │
├─────────────────────────────────┤
│         DISTORTION TYPE         │
│ CLASSIC  TURBO  O-DRIVE  BYPASS │
│   ▯       ▯       ▯       ▯     │
└─────────────────────────────────┘
```

Contraintes :

- les trois knobs ont la même taille ;
- les quatre modes ont exactement le même poids visuel ;
- la LED du mode sélectionné est allumée ;
- la LED `ACTIVE` est allumée pour les trois modes sonores et éteinte pour
  `BYPASS` ;
- aucune commande supplémentaire ne doit être inventée ;
- les labels visibles sont exactement `DRIVE`, `TONE`, `LEVEL`, `CLASSIC`,
  `TURBO`, `O-DRIVE`, `BYPASS`, `ACTIVE` et `DISTORTION TYPE`.

### 12.3 Comportement des boutons de mode

Les quatre boutons forment un sélecteur exclusif, équivalent à un groupe de
boutons radio :

- cliquer sélectionne immédiatement le mode ;
- un seul voyant de mode est allumé ;
- sélectionner le mode déjà actif ne change rien ;
- les flèches gauche/droite peuvent déplacer la sélection au clavier ;
- `Space` ou `Enter` active le bouton focalisé.

Ne pas utiliser des boutons indépendants qui permettraient plusieurs modes
actifs à la fois.

### 12.4 Comportement des knobs

Réutiliser le composant `RotaryKnob` de SONO-303 :

- glisser verticalement vers le haut augmente la valeur ;
- glisser vers le bas la diminue ;
- les flèches changent la valeur par petit pas ;
- `Shift + flèche` utilise un pas fin ;
- `Home` va au minimum ;
- `End` va au maximum ;
- double-clic rétablit la valeur par défaut ;
- `aria-label`, `aria-valuemin`, `aria-valuemax` et `aria-valuenow` sont requis.

Les contrôles doivent rester manipulables pendant la lecture du séquenceur.

### 12.5 Accessibilité et responsive

- Cible interactive minimale : `44 × 44 px`.
- Contraste lisible sur la façade métallique.
- État actif indiqué par la LED **et** par une différence de forme, de bordure ou
  de profondeur ; la couleur seule ne suffit pas.
- Le module doit rester utilisable à `320 px` de largeur.
- Sur petit écran, les trois knobs peuvent rester sur une ligne si leurs zones
  tactiles restent suffisantes ; sinon passer à une grille `2 + 1`.
- Respecter `prefers-reduced-motion` en réduisant les animations visuelles, sans
  supprimer les rampes audio anti-clic.

---

## 13. Valeurs par défaut

| Élément | Valeur initiale | Résultat attendu |
|---|---:|---|
| Mode | CLASSIC | Saturation chaude immédiatement musicale |
| DRIVE | 38 % | Grain audible sans écrasement total |
| TONE | 58 % | Assez ouvert pour conserver l’acidité |
| LEVEL | 67 % | Environ -5.9 dB avant compensation de mode |
| ACTIVE | allumée | Car CLASSIC est actif |

Le pattern SONO-303 doit déjà produire un son exploitable avec ces valeurs. Le
premier lancement ne doit pas générer un niveau de sortie brutal.

---

## 14. Sécurité audio

- Utiliser un `Tone.Limiter(-1)` unique juste avant la destination.
- Limiter les valeurs UI avant le mapping.
- Ne jamais produire de gain infini ou de courbe hors plage.
- Ne jamais connecter deux fois la même sortie au master.
- Ne pas ajouter d’auto-gain complexe dans le MVP.
- Tester TURBO avec DRIVE et LEVEL au maximum avant livraison.
- Une réduction interne de niveau par mode ne remplace pas le limiteur final.

Le limiteur est un filet de sécurité, pas une excuse pour ignorer le gain
staging.

---

## 15. Plan d’implémentation recommandé

1. Ajouter les types, l’état par défaut et le reducer SONO-DIST.
2. Écrire et tester les fonctions pures de mapping.
3. Écrire et tester les trois générateurs de courbe.
4. Construire `SonoDistEngine` avec tous ses nœuds créés une seule fois.
5. Implémenter les setters lissés et les transitions de mode anti-clic.
6. Modifier la sortie de `Sono303Engine` pour supprimer toute connexion directe
   à la destination.
7. Câbler `SONO-303 -> SONO-DIST -> master -> limiter -> destination`.
8. Construire `SonoDistPanel` avec les trois knobs et le groupe exclusif de
   modes.
9. Appliquer le design aluminium/graphite/rouge existant.
10. Vérifier accessibilité, responsive, build, lint et audio réel.

---

## 16. Critères d’acceptation

L’implémentation est terminée seulement si tous les points suivants sont vrais.

### Audio

- CLASSIC, TURBO et O-DRIVE sont clairement différents avec les mêmes positions
  de knobs.
- CLASSIC est doux et progressif.
- TURBO est le plus agressif et ne produit pas un saut de volume dangereux.
- O-DRIVE est asymétrique et plus organique.
- BYPASS restitue le signal sec sans passer par le filtre TONE ni le LEVEL.
- Aucun doublage du chemin sec n’est audible.
- Les changements de mode ne créent pas de clic notable.
- Les mouvements de DRIVE, TONE et LEVEL sont lissés.
- Le mode TURBO à réglages maximum ne provoque pas de sortie incontrôlée.

### État et moteur

- Les nœuds Tone.js ne sont instanciés qu’une fois.
- React ne possède que des données sérialisables.
- `active` est dérivé du mode.
- Changer de mode ne recrée aucun nœud.
- `dispose()` libère tous les nœuds et transitions détenus.
- Le build TypeScript strict et le lint réussissent.

### Interface

- Le nom visible est SONO-DIST.
- Seuls DRIVE, TONE, LEVEL et les quatre modes sont contrôlables.
- Un seul mode est sélectionné à la fois.
- Les LED de mode et ACTIVE reflètent correctement l’état.
- Les knobs fonctionnent à la souris, au tactile et au clavier.
- L’interface reste lisible et utilisable sur mobile.
- Le module ressemble visuellement à un compagnon matériel de SONO-303.

---

## 17. Non-objectifs explicites

Ne pas ajouter dans le MVP :

- reproduction exacte d’un circuit analogique ;
- impulsion de cabinet ou simulation d’ampli ;
- réglage dry/wet exposé ;
- noise gate ;
- compression multibande ;
- égaliseur paramétrique ;
- reverb, delay, chorus ou phaser ;
- automation dessinée ;
- presets séparés de distorsion ;
- visualiseur de waveform ou analyseur FFT ;
- stéréo widening ;
- câble audio interactif dans l’interface fonctionnelle.

Le câble peut apparaître dans le concept art et dans la mise en scène visuelle,
mais il n’a pas besoin d’être un contrôle manipulable dans l’application.

---

## 18. Définition finale du produit

SONO-DIST est réussi lorsqu’il donne à SONO-303 trois couleurs de saturation
immédiatement reconnaissables avec seulement trois knobs, tout en restant sûr,
simple et agréable à manipuler en temps réel.

L’essentiel n’est pas d’imiter chaque détail d’une pédale physique. L’essentiel
est que :

- `DRIVE` décide combien le son sature ;
- `TONE` décide si cette saturation est sombre ou brillante ;
- `LEVEL` équilibre le volume traité ;
- `CLASSIC`, `TURBO` et `O-DRIVE` possèdent trois caractères distincts ;
- `BYPASS` rend exactement le chemin sec ;
- l’ensemble reste un compagnon visuel et sonore cohérent de SONO-303.

---

## 19. Références techniques

Spécification basée sur Tone.js 15.0.4 :

- [Tone.WaveShaper](https://tonejs.github.io/docs/15.0.4/classes/WaveShaper.html)
- [Tone.CrossFade](https://tonejs.github.io/docs/15.0.4/classes/CrossFade.html)
- [Tone.Filter](https://tonejs.github.io/docs/15.0.4/classes/Filter.html)
- [Tone.Gain](https://tonejs.github.io/docs/15.0.4/classes/Gain.html)
- [Tone.Limiter](https://tonejs.github.io/docs/15.0.4/classes/Limiter.html)

