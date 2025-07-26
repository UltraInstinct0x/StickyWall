import { render, screen } from '@testing-library/react'
import Home from '../src/app/page'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      back: jest.fn(),
    }
  },
}))

describe('Home Page', () => {
  it('renders the main heading', () => {
    render(<Home />)
    
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toBeInTheDocument()
  })

  it('renders without crashing', () => {
    render(<Home />)
    expect(document.body).toBeInTheDocument()
  })
})