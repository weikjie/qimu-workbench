interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg'
}

export function BrandMark({ size = 'md' }: BrandMarkProps): React.JSX.Element {
  return (
    <div className={`brand-mark brand-mark--${size}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M20 31.5V17.4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.92"
        />
        <path
          d="M20 23.3C13.8 23.3 10.5 20 10.5 13.7C16.8 13.7 20 17 20 23.3Z"
          fill="currentColor"
          opacity="0.62"
        />
        <path
          d="M20 19.9C20 13.6 23.2 10.3 29.5 10.3C29.5 16.6 26.3 19.9 20 19.9Z"
          fill="currentColor"
        />
        <path
          d="M14.2 29.9C16 31.1 18.2 31.8 20.5 31.8C22.5 31.8 24.4 31.3 26.1 30.4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.35"
        />
      </svg>
    </div>
  )
}
