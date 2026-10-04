import { app } from '@azure/functions';
import { registration } from './registration.mjs';

app.http('almideApi', registration);
