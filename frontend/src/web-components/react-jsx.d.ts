// Lets React's JSX type-check the framework-free custom elements in this folder.
// Typing only — the elements themselves have no React dependency.
import type { DetailedHTMLProps, HTMLAttributes } from 'react'
import type { DoMyShoppingButton } from './do-my-shopping-button'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'do-my-shopping-button': DetailedHTMLProps<HTMLAttributes<DoMyShoppingButton>, DoMyShoppingButton> & {
        label?: string
        'api-base'?: string
      }
    }
  }
}
