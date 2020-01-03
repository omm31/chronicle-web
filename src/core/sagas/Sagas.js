/*
 * @flow
 */

import { all, fork } from '@redux-saga/core/effects';
import { AuthSagas } from 'lattice-auth';

import * as AppSagas from '../../containers/app/AppSagas';
import * as EDMSagas from '../edm/EDMSagas';
import * as RoutingSagas from '../router/RoutingSagas';
import * as StudiesSagas from '../../containers/studies/StudiesSagas';
import * as DataSagas from './data/DataSagas';

export default function* sagas() :Generator<*, *, *> {

  yield all([
    // "lattice-auth" sagas
    fork(AuthSagas.watchAuthAttempt),
    fork(AuthSagas.watchAuthExpired),
    fork(AuthSagas.watchAuthFailure),
    fork(AuthSagas.watchAuthSuccess),
    fork(AuthSagas.watchLogout),

    // AppSagas
    fork(AppSagas.initializeApplicationWatcher),

    // EDMSagas
    fork(EDMSagas.getEntityDataModelTypesWatcher),
    fork(EDMSagas.getAllEntitySetIdsWatcher),

    // RoutingSagas
    fork(RoutingSagas.goToRootWatcher),
    fork(RoutingSagas.goToRouteWatcher),

    // studies sagas
    fork(StudiesSagas.addStudyParticipantWatcher),
    fork(StudiesSagas.changeEnrollmentWatcher),
    fork(StudiesSagas.createParticipantsEntitySetWatcher),
    fork(StudiesSagas.createStudyWatcher),
    fork(StudiesSagas.deleteStudyParticipantWatcher),
    fork(StudiesSagas.getParticipantsEnrollmentStatusWatcher),
    fork(StudiesSagas.getStudiesWatcher),
    fork(StudiesSagas.getStudyParticipantsWatcher),

    // DataSagas
    fork(DataSagas.submitDataGraphWatcher)
  ]);
}
