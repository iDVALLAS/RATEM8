/**
 * OrbMonogram — the raised M8 monogram inside the hero orb (Edit 7,
 * patch v14). Hero orb only; mark and ambient orbs never render it.
 *
 * Layering (inside the `.orb` span, so it rides the breathing scale):
 *   base gradient (.orb background)
 *   → this layer (clipped to the orb circle)
 *   → gloss highlight (.orb::before, lifted to z-index 1 by .orb--mono)
 *
 * The asset is `public/brand/m8-monogram.svg`, a single-colour outline
 * on transparent. The filter recolours it from its alpha channel, so any
 * stroke colour in the file works:
 *   1. flood M8 Green inside the stroke
 *   2. bevel: specular light from the upper left (matches the gloss),
 *      clipped back inside the stroke and added on top
 *   3. shadow: Forest at 75%, offset (1.8, 2.4), blur 1.6
 *
 * Filter colours (flood, light) are set in home.css so no hex lives here.
 * Opacity is driven entirely by CSS classes on the hero orb button
 * (see `.hm-orb-mono` in home.css). Purely decorative: aria-hidden.
 */
export default function OrbMonogram() {
  return (
    <span aria-hidden="true" className="hm-orb-mono">
      <span className="hm-orb-mono__curve">
        <svg className="hm-orb-mono__svg" viewBox="0 0 100 100" focusable="false">
          <defs>
            <filter id="m8-mono-raise" x="-15%" y="-15%" width="140%" height="140%" colorInterpolationFilters="sRGB">
              <feFlood className="hm-orb-mono__green" result="green" />
              <feComposite in="green" in2="SourceAlpha" operator="in" result="stroke" />

              <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="bump" />
              <feSpecularLighting in="bump" surfaceScale="4" specularConstant="1" specularExponent="18" className="hm-orb-mono__light" result="spec">
                <feDistantLight azimuth="225" elevation="45" />
              </feSpecularLighting>
              <feComposite in="spec" in2="SourceAlpha" operator="in" result="specInside" />
              <feComposite in="stroke" in2="specInside" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit" />

              <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="shadowBlur" />
              <feOffset in="shadowBlur" dx="1.8" dy="2.4" result="shadowOffset" />
              <feFlood className="hm-orb-mono__forest" result="forest" />
              <feComposite in="forest" in2="shadowOffset" operator="in" result="shadow" />

              <feMerge>
                <feMergeNode in="shadow" />
                <feMergeNode in="lit" />
              </feMerge>
            </filter>
          </defs>
          <image href="/brand/m8-monogram.svg" x="6" y="6" width="88" height="88" filter="url(#m8-mono-raise)" />
        </svg>
      </span>
    </span>
  );
}
