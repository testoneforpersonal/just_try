import React from 'react';
import { render } from 'react-dom';
import { MemoryRouter, Route, Switch } from 'react-router-dom';
import EditScreen from './EditScreen';
import Landing from './Landing';

const App = props => {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        backgroundColor: '#FFF',
        height: '100vh',
      }}>
      <MemoryRouter>
        <Switch>
          <Route exact path="/" component={Landing} />
          <Route path="/edit" component={EditScreen} />
        </Switch>
      </MemoryRouter>
    </div>
  );
};

render(<App />, document.getElementById('root'));
