import { Link } from 'react-router-dom';

export default function MarketingNavbar() {
  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <nav className="flex items-center justify-between p-6 lg:px-8" aria-label="Global">
        <div className="flex lg:flex-1">
          <Link to="/" className="-m-1.5 p-1.5 text-xl font-bold text-indigo-600">
            Olin
          </Link>
        </div>
        <div className="hidden lg:flex lg:gap-x-12">
          <a href="#features" className="text-sm font-semibold leading-6 text-gray-900">Features</a>
          <a href="#" className="text-sm font-semibold leading-6 text-gray-900">Manifesto</a>
          <Link to="/profiles" className="text-sm font-semibold leading-6 text-gray-900">Student Profiles</Link>
        </div>
        <div className="flex flex-1 justify-end gap-x-4">
          <Link to="/dashboard" className="text-sm font-semibold leading-6 text-gray-900 pt-2">
            Log in <span aria-hidden="true">&rarr;</span>
          </Link>
          <Link 
            to="/dashboard" 
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Get Started
          </Link>
        </div>
      </nav>
    </header>
  );
}

