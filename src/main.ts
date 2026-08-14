import './style.css';
import { App } from './ui/App.ts';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app root element not found');

new App(root);
