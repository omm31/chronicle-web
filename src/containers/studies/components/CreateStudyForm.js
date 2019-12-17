/*
 * @flow
 */

import React from 'react';

import uuid from 'uuid/v4';
import { Map, setIn } from 'immutable';
import { DataProcessingUtils, Form } from 'lattice-fabricate';
import { useDispatch, useSelector } from 'react-redux';

import { dataSchema, uiSchema } from './CreateStudySchemas';
import { ENTITY_SET_NAMES } from '../../../core/edm/constants/EntitySetNames';
import { PROPERTY_TYPE_FQNS } from '../../../core/edm/constants/FullyQualifiedNames';
import { createStudy } from '../StudiesActions';

const { STUDY_ID } = PROPERTY_TYPE_FQNS;
const { CHRONICLE_STUDIES } = ENTITY_SET_NAMES;
const { processEntityData, getEntityAddressKey, getPageSectionKey } = DataProcessingUtils;

type Props = {
};

const CreateStudyForm = (props :Props, ref) => {

  const allEntitySetIds :Map = useSelector((store :Map) => store.getIn(['edm', 'entitySetIds']));
  const propertyTypeIds :Map = useSelector((store :Map) => store.getIn(['edm', 'propertyTypesFqnIdMap']));
  const dispatch = useDispatch();

  const handleSubmit = (payload :any) => {
    let { formData: newFormData } = payload;
    newFormData = setIn(newFormData,
      [getPageSectionKey(1, 1), getEntityAddressKey(0, CHRONICLE_STUDIES, STUDY_ID)], uuid());

    const entityData = processEntityData(newFormData, allEntitySetIds, propertyTypeIds);
    const assocationEntityData = {};

    dispatch(createStudy({
      entityData,
      assocationEntityData
    }));
  };

  return (
    <Form
        noPadding
        onSubmit={handleSubmit}
        hideSubmit
        ref={ref}
        schema={dataSchema}
        uiSchema={uiSchema} />
  );
};

export default React.memo<Props, typeof Form>(
  React.forwardRef(CreateStudyForm)
);
