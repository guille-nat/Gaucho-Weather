import PropTypes from 'prop-types';
import Navbar from '../NavBar';
import './style/Layout.css';
import FooterPage from '../FooterPage';


function Layout({ component: Component }) {

  return (
    <div className="layout">
      {/* Keyboard-only escape hatch past the navbar: hidden until it
          receives focus (index.css .skip-link), then jumps straight to the
          page's main content. */}
      <a href="#main-content" className="skip-link">
        Saltar al contenido principal
      </a>
      <Navbar />
      {/* tabIndex=-1: <main> isn't natively focusable, but the skip-link
          above needs to move focus here (not just scroll) when activated. */}
      <main id="main-content" className="layout-content" tabIndex={-1}>
        {Component}
      </main>
      <FooterPage/>
    </div>
  );
}

Layout.propTypes = {
  component: PropTypes.node.isRequired,
};

export default Layout;