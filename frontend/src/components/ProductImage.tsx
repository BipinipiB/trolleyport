import { useState, type ReactNode } from 'react'
import type { Product } from '../catalog'
import { PRODUCT_PHOTOS, photoUrl } from '../productPhotos'

/*
 * Original illustrated "styled scenes" for each product: the food sits on a surface that suits its category
 * (wooden board, linen, kraft paper, marble…) with a small prop, rather than isolated on white.
 * Products with a licensed photo (see productPhotos.ts) show that instead; the illustration remains the fallback if
 * a product has no photo or its photo fails to load.
 */

type Scene = { surface: string; grain: string; prop: (key: string) => ReactNode }

const SCENES: Record<string, Scene> = {
  Produce: { surface: '#D8B98F', grain: '#C7A47A', prop: (k) => <Sprig key={k} x={262} y={40} /> },
  Dairy: { surface: '#ECE5D8', grain: '#DED3C1', prop: (k) => <Napkin key={k} /> },
  Bakery: { surface: '#E4CFAA', grain: '#D6BD93', prop: (k) => <Flour key={k} /> },
  'Meat & Protein': { surface: '#E6E2DB', grain: '#CFC9BF', prop: (k) => <Sprig key={k} x={60} y={150} /> },
  Snacks: { surface: '#EBCDB4', grain: '#DDBA9D', prop: (k) => <Bowl key={k} x={262} y={150} r={22} fill="#F3E9DC" /> },
  Pantry: { surface: '#DCD3C4', grain: '#CBBFAC', prop: (k) => <Spoon key={k} /> },
}

/** Which drawing to use for each product. Presentation only. */
const ART: Record<string, ReactNode> = {
  'prod-001': <Bananas />,
  'prod-002': <Round fill="#C8463C" leaf />,
  'prod-003': <Carrots />,
  'prod-004': <Broccoli />,
  'prod-005': <Bowl x={160} y={108} r={50} fill="#F5EFE6" contents="#4F8A3B" />,
  'prod-006': <Round fill="#D9442F" stalk />,
  'prod-007': <Avocado />,
  'prod-008': <Bottle />,
  'prod-009': <Tub />,
  'prod-010': <Wedge />,
  'prod-011': <Block fill="#F3DE8A" wrapper="#F7F1E3" />,
  'prod-012': <Eggs />,
  'prod-013': <Loaf />,
  'prod-014': <Boule />,
  'prod-015': <Croissants />,
  'prod-016': <Bagels />,
  'prod-017': <Fillet fill="#F0C9B5" />,
  'prod-018': <Mince />,
  'prod-019': <Fillet fill="#F29A6B" stripes />,
  'prod-020': <Bacon />,
  'prod-021': <Block fill="#F6F1E4" cubes />,
  'prod-022': <Packet />,
  'prod-023': <ChocolateBar />,
  'prod-024': <Bowl x={160} y={108} r={50} fill="#F5EFE6" contents="#A86B3C" />,
  'prod-025': <MuesliBars />,
  'prod-026': <Bowl x={160} y={108} r={50} fill="#F5EFE6" contents="#F8F4EA" />,
  'prod-027': <Spaghetti />,
  'prod-028': <Jar fill="#B8392B" lid="#E9E2D3" />,
  'prod-029': <Bowl x={160} y={108} r={50} fill="#F5EFE6" contents="#D9C29A" />,
  'prod-030': <Jar fill="#B07A45" lid="#0F5257" />,
}

export function ProductImage({ product, className }: { product: Product; className?: string }) {
  const photo = PRODUCT_PHOTOS[product.id]
  const [photoFailed, setPhotoFailed] = useState(false)
  if (photo && !photoFailed) {
    return (
      <img
        className={className}
        src={photoUrl(product.id)}
        alt={photo.alt}
        loading="lazy"
        decoding="async"
        onError={() => setPhotoFailed(true)}
      />
    )
  }
  return <Illustration product={product} className={className} />
}

function Illustration({ product, className }: { product: Product; className?: string }) {
  const scene = SCENES[product.category] ?? SCENES.Pantry
  return (
    <svg className={className} viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${product.name}, styled illustration`}>
      <rect width="320" height="200" fill={scene.surface} />
      {[28, 70, 118, 160, 186].map((y, i) => (
        <path key={i} d={`M0 ${y} Q 80 ${y - 6} 160 ${y} T 320 ${y}`} stroke={scene.grain} strokeWidth="2" fill="none" opacity="0.6" />
      ))}
      {scene.prop('prop')}
      <ellipse cx="160" cy="160" rx="92" ry="14" fill="#000" opacity="0.12" />
      {ART[product.id] ?? <Round fill="#C9A27A" />}
    </svg>
  )
}

// ---- props ----
function Sprig({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-25)`} opacity="0.9">
      <path d="M0 0 L0 46" stroke="#6E8B5A" strokeWidth="3" />
      {[6, 18, 30].map((d) => (
        <g key={d}>
          <ellipse cx="-8" cy={d} rx="8" ry="4" fill="#7FA167" transform={`rotate(-30 -8 ${d})`} />
          <ellipse cx="8" cy={d + 6} rx="8" ry="4" fill="#7FA167" transform={`rotate(30 8 ${d + 6})`} />
        </g>
      ))}
    </g>
  )
}
function Napkin() {
  return (
    <g opacity="0.9">
      <rect x="230" y="0" width="90" height="200" fill="#F7F3EC" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={240 + i * 26} y="0" width="8" height="200" fill="#9DB5C6" opacity="0.6" />
      ))}
    </g>
  )
}
function Flour() {
  return (
    <g fill="#FFFDF7" opacity="0.8">
      {[[40, 40], [58, 30], [72, 52], [256, 150], [270, 166], [282, 140], [36, 170]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3" />
      ))}
    </g>
  )
}
function Spoon() {
  return (
    <g transform="translate(250 22) rotate(35)">
      <ellipse cx="0" cy="0" rx="14" ry="20" fill="#B88A5A" />
      <rect x="-4" y="16" width="8" height="70" rx="4" fill="#B88A5A" />
    </g>
  )
}

// ---- food ----
function Round({ fill, leaf, stalk }: { fill: string; leaf?: boolean; stalk?: boolean }) {
  return (
    <g>
      {[[128, 118], [188, 116], [158, 92]].map(([x, y]) => (
        <g key={`${x}`}>
          <circle cx={x} cy={y} r="30" fill={fill} />
          <circle cx={x - 10} cy={y - 10} r="7" fill="#fff" opacity="0.25" />
          {leaf && <ellipse cx={x + 8} cy={y - 32} rx="9" ry="4" fill="#6E9A4E" transform={`rotate(-30 ${x + 8} ${y - 32})`} />}
          {stalk && <path d={`M${x - 8} ${y - 28} l8 6 l8 -6 l-8 -3z`} fill="#5E8C3E" />}
        </g>
      ))}
    </g>
  )
}
function Bananas() {
  // Three crescents fanning out from a shared stem at the top right.
  return (
    <g transform="rotate(-12 160 110)">
      {[-14, 0, 14].map((d) => (
        <g key={d} transform={`rotate(${d} 214 70)`}>
          <path d="M214 70 C 200 140, 130 160, 96 128 C 136 136, 186 118, 206 66 Z" fill="#F1C94B" stroke="#C99B2B" strokeWidth="2" />
          <circle cx="97" cy="128" r="3" fill="#5A4220" />
        </g>
      ))}
      <rect x="204" y="56" width="16" height="16" rx="4" fill="#7A5B2A" />
    </g>
  )
}
function Carrots() {
  return (
    <g>
      {[-18, 0, 18].map((d) => (
        <g key={d} transform={`translate(${160 + d * 2} 110) rotate(${d * 2})`}>
          <path d="M-12 -40 L12 -40 L2 50 L-2 50z" fill="#E8833A" />
          <path d="M-4 -40 l-10 -18 M0 -40 l0 -22 M4 -40 l10 -18" stroke="#6E9A4E" strokeWidth="4" />
        </g>
      ))}
    </g>
  )
}
function Broccoli() {
  return (
    <g>
      <path d="M150 120 L170 120 L176 160 L144 160z" fill="#A7C08A" />
      {[[136, 98], [160, 84], [184, 98], [148, 112], [174, 112]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="22" fill="#4E7F3A" />
      ))}
    </g>
  )
}
function Avocado() {
  return (
    <g>
      <ellipse cx="128" cy="110" rx="38" ry="50" fill="#3F5E2A" />
      <ellipse cx="200" cy="110" rx="38" ry="50" fill="#3F5E2A" />
      <ellipse cx="200" cy="112" rx="30" ry="42" fill="#D6E3A0" />
      <circle cx="200" cy="122" r="16" fill="#8A5A34" />
    </g>
  )
}
function Bottle() {
  return (
    <g>
      <rect x="128" y="50" width="64" height="112" rx="16" fill="#FBFAF6" stroke="#DCD6CB" strokeWidth="2" />
      <rect x="144" y="34" width="32" height="20" rx="4" fill="#4A7FA8" />
      <rect x="128" y="96" width="64" height="30" fill="#CFE0EA" />
    </g>
  )
}
function Tub() {
  return (
    <g>
      <path d="M116 80 L204 80 L194 160 L126 160z" fill="#FBFAF6" stroke="#DCD6CB" strokeWidth="2" />
      <ellipse cx="160" cy="80" rx="44" ry="10" fill="#E9EEF2" />
      <rect x="128" y="104" width="64" height="26" rx="4" fill="#9DB5C6" />
    </g>
  )
}
function Wedge() {
  return (
    <g>
      <path d="M100 150 L220 150 L220 100 L100 130z" fill="#F2C85B" />
      <path d="M100 130 L220 100 L190 86 z" fill="#F7DA86" />
      {[[140, 136], [180, 126], [204, 138]].map(([x, y]) => (
        <circle key={`${x}`} cx={x} cy={y} r="6" fill="#E0AE3A" />
      ))}
    </g>
  )
}
function Block({ fill, wrapper, cubes }: { fill: string; wrapper?: string; cubes?: boolean }) {
  return (
    <g>
      {wrapper && <rect x="104" y="96" width="112" height="60" rx="6" fill={wrapper} />}
      <rect x={cubes ? 112 : 124} y={cubes ? 96 : 88} width={cubes ? 70 : 86} height={cubes ? 56 : 46} rx="6" fill={fill} stroke="#D8CFB8" strokeWidth="2" />
      {cubes &&
        [[192, 120], [212, 136], [196, 146]].map(([x, y]) => <rect key={`${x}`} x={x} y={y} width="18" height="18" rx="3" fill={fill} stroke="#D8CFB8" strokeWidth="2" />)}
    </g>
  )
}
function Eggs() {
  return (
    <g>
      <rect x="92" y="104" width="136" height="50" rx="8" fill="#C9B79A" />
      {[0, 1, 2, 3].map((i) => (
        <ellipse key={i} cx={112 + i * 32} cy="104" rx="14" ry="18" fill="#F4E6D2" />
      ))}
    </g>
  )
}
function Loaf() {
  return (
    <g>
      <rect x="96" y="92" width="128" height="64" rx="18" fill="#B9834F" />
      <rect x="96" y="80" width="128" height="40" rx="20" fill="#C9935C" />
      {[124, 156, 188].map((x) => (
        <path key={x} d={`M${x} 86 l16 18`} stroke="#E8C79B" strokeWidth="4" />
      ))}
    </g>
  )
}
function Boule() {
  return (
    <g>
      <ellipse cx="160" cy="118" rx="70" ry="46" fill="#B07A45" />
      <path d="M118 104 Q160 84 202 104" stroke="#EBD3AE" strokeWidth="5" fill="none" />
      <path d="M128 124 Q160 106 192 124" stroke="#EBD3AE" strokeWidth="4" fill="none" />
    </g>
  )
}
function Croissants() {
  return (
    <g fill="#D9A15E" stroke="#B9803F" strokeWidth="2">
      {[118, 196].map((x) => (
        <path key={x} d={`M${x - 42} 128 Q ${x} 64 ${x + 42} 128 Q ${x} 104 ${x - 42} 128z`} />
      ))}
    </g>
  )
}
function Bagels() {
  return (
    <g>
      {[[128, 112], [194, 118]].map(([x, y]) => (
        <g key={x}>
          <circle cx={x} cy={y} r="34" fill="#D7AE73" />
          <circle cx={x} cy={y} r="11" fill="#E4CFAA" />
        </g>
      ))}
    </g>
  )
}
function Fillet({ fill, stripes }: { fill: string; stripes?: boolean }) {
  return (
    <g>
      <rect x="88" y="78" width="148" height="88" rx="10" fill="#C79A6A" />
      <path d="M108 128 Q150 82 214 104 Q206 150 128 150z" fill={fill} />
      {stripes && [130, 152, 174].map((x) => <path key={x} d={`M${x} 104 q6 20 0 40`} stroke="#FBD6BE" strokeWidth="3" fill="none" />)}
    </g>
  )
}
function Mince() {
  return (
    <g>
      <rect x="92" y="84" width="140" height="80" rx="8" fill="#F3EDE2" />
      <ellipse cx="162" cy="124" rx="50" ry="26" fill="#9C3F34" />
      {[[146, 116], [170, 128], [182, 114], [154, 132]].map(([x, y]) => <circle key={`${x}`} cx={x} cy={y} r="5" fill="#C9705F" />)}
    </g>
  )
}
function Bacon() {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M96 ${96 + i * 22} q32 -10 64 0 t64 0 v14 q-32 -10 -64 0 t-64 0z`} fill="#C2584A" stroke="#F1D2C3" strokeWidth="3" />
      ))}
    </g>
  )
}
function Packet() {
  return (
    <g>
      <path d="M118 62 L202 62 L210 160 L110 160z" fill="#2F6E8F" />
      <rect x="118" y="62" width="84" height="10" fill="#24566F" />
      <circle cx="160" cy="116" r="22" fill="#F1C94B" />
    </g>
  )
}
function ChocolateBar() {
  return (
    <g transform="rotate(-8 160 118)">
      <rect x="92" y="90" width="136" height="60" rx="4" fill="#5A3624" />
      {[0, 1, 2, 3].map((c) =>
        [0, 1].map((r) => <rect key={`${c}-${r}`} x={98 + c * 33} y={96 + r * 27} width="28" height="22" rx="2" fill="#6E4430" />),
      )}
      <rect x="164" y="84" width="72" height="72" fill="#E9DFCF" />
    </g>
  )
}
function MuesliBars() {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={100 + i * 42} y={88 + (i % 2) * 8} width="34" height="70" rx="5" fill="#C99A5B" stroke="#A9783E" strokeWidth="2" />
      ))}
    </g>
  )
}
function Spaghetti() {
  return (
    <g>
      {Array.from({ length: 9 }, (_, i) => (
        <path key={i} d={`M${104 + i * 2} ${150 - i} L${214 + i * 2} ${76 + i}`} stroke="#EBCB82" strokeWidth="3" />
      ))}
      <rect x="146" y="104" width="30" height="22" rx="4" fill="#0F5257" transform="rotate(-34 161 115)" />
    </g>
  )
}
function Jar({ fill, lid }: { fill: string; lid: string }) {
  return (
    <g>
      <rect x="122" y="70" width="76" height="92" rx="14" fill={fill} />
      <rect x="128" y="58" width="64" height="18" rx="4" fill={lid} />
      <rect x="132" y="102" width="56" height="30" rx="4" fill="#F7F1E3" />
    </g>
  )
}
function Bowl({ x, y, r, fill, contents }: { x: number; y: number; r: number; fill: string; contents?: string }) {
  return (
    <g>
      {contents && <ellipse cx={x} cy={y - r * 0.25} rx={r * 0.92} ry={r * 0.42} fill={contents} />}
      {contents &&
        Array.from({ length: 7 }, (_, i) => (
          <circle key={i} cx={x - r * 0.6 + i * (r * 0.2)} cy={y - r * 0.3 - (i % 2) * 6} r={r * 0.12} fill={contents} stroke="#00000014" />
        ))}
      <path d={`M${x - r} ${y - r * 0.2} A ${r} ${r * 0.9} 0 0 0 ${x + r} ${y - r * 0.2} z`} fill={fill} stroke="#D8CFBF" strokeWidth="2" />
    </g>
  )
}
