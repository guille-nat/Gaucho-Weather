import { useEffect,useState } from 'react';
import Navbar from '../NavBar';
import './style/Layout.css';
import FooterPage from '../FooterPage';


function Layout({ component: Component }) {

  return (
    <div className="layout">
      <Navbar />
      <div className="layout-content">
        {Component}
      </div>
      <FooterPage/>
    </div>
  );
}

export default Layout;