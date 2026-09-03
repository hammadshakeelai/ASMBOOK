import { render } from 'preact';
import { App } from './ui/app.js';
import './ui/style.css';

render(<App />, document.getElementById('app')!);
