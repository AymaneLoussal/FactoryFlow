const test = require('node:test');
const assert = require('node:assert/strict');

const MatiereRepository = require('../../src/repositories/MatiereRepository');
const MatiereService = require('../../src/services/MatiereService');
const CompositionProduit = require('../../src/models/CompositionProduit');
const LotStock = require('../../src/models/LotStock');

const ids = {
  matiere: '64a1b2c3d4e5f60718293051',
  matiere2: '64a1b2c3d4e5f60718293052',
  composition: '64a1b2c3d4e5f60718293061',
  lot: '64a1b2c3d4e5f60718293071',
};

const validData = {
  reference: 'MAT-001',
  nom: 'Acier Inoxydable',
  unite: 'kg',
  seuilAlerte: 100,
};

const originalMethods = [];

function stub(target, methodName, implementation) {
  originalMethods.push({
    target,
    methodName,
    original: target[methodName],
  });
  target[methodName] = implementation;
}

function expectServiceError(error, statusCode, message) {
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.message, message);
}

test.afterEach(() => {
  for (const { target, methodName, original } of originalMethods.reverse()) {
    target[methodName] = original;
  }
  originalMethods.length = 0;
});

test('creates a material successfully with trimmed fields', async () => {
  const created = { _id: ids.matiere, ...validData };
  let receivedData;

  stub(MatiereRepository, 'findByReference', async () => null);
  stub(MatiereRepository, 'create', async (data) => {
    receivedData = data;
    return created;
  });

  const result = await MatiereService.create({
    reference: '  MAT-001  ',
    nom: '  Acier Inoxydable  ',
    unite: '  kg  ',
    seuilAlerte: 100,
  });

  assert.deepEqual(receivedData, validData);
  assert.deepEqual(result, created);
});

test('rejects missing or non-object material data during creation', async () => {
  await assert.rejects(
    () => MatiereService.create(null),
    (error) => {
      expectServiceError(error, 400, 'Material data is required');
      return true;
    }
  );

  await assert.rejects(
    () => MatiereService.create([]),
    (error) => {
      expectServiceError(error, 400, 'Material data is required');
      return true;
    }
  );
});

test('rejects unsupported fields during creation', async () => {
  await assert.rejects(
    () => MatiereService.create({ ...validData, extra: true }),
    (error) => {
      expectServiceError(error, 400, 'Unsupported material field(s): extra');
      return true;
    }
  );
});

test('rejects missing required creation fields', async () => {
  await assert.rejects(
    () => MatiereService.create({ nom: 'Fer', unite: 'kg', seuilAlerte: 10 }),
    (error) => {
      expectServiceError(
        error,
        400,
        'reference, nom, unite, and seuilAlerte are required'
      );
      return true;
    }
  );
});

test('rejects empty or whitespace string fields', async () => {
  await assert.rejects(
    () => MatiereService.create({ ...validData, reference: '   ' }),
    (error) => {
      expectServiceError(error, 400, 'reference must be a non-empty string');
      return true;
    }
  );

  await assert.rejects(
    () => MatiereService.create({ ...validData, nom: '   ' }),
    (error) => {
      expectServiceError(error, 400, 'nom must be a non-empty string');
      return true;
    }
  );

  await assert.rejects(
    () => MatiereService.create({ ...validData, unite: '   ' }),
    (error) => {
      expectServiceError(error, 400, 'unite must be a non-empty string');
      return true;
    }
  );
});

test('rejects non-numeric, negative, NaN, or infinite seuilAlerte', async () => {
  const invalidValues = ['10', -5, NaN, Infinity, -Infinity];

  for (const value of invalidValues) {
    await assert.rejects(
      () => MatiereService.create({ ...validData, seuilAlerte: value }),
      (error) => {
        expectServiceError(
          error,
          400,
          'seuilAlerte must be a finite number greater than or equal to 0'
        );
        return true;
      }
    );
  }
});

test('rejects creation of duplicate material reference', async () => {
  stub(MatiereRepository, 'findByReference', async () => ({
    _id: ids.matiere,
    ...validData,
  }));

  await assert.rejects(
    () => MatiereService.create(validData),
    (error) => {
      expectServiceError(
        error,
        409,
        'A material with this reference already exists'
      );
      return true;
    }
  );
});

test('maps a duplicate-key error during creation to a conflict', async () => {
  stub(MatiereRepository, 'findByReference', async () => null);
  stub(MatiereRepository, 'create', async () => {
    const error = new Error('E11000 duplicate key');
    error.code = 11000;
    throw error;
  });

  await assert.rejects(
    () => MatiereService.create(validData),
    (error) => {
      expectServiceError(
        error,
        409,
        'A material with this reference already exists'
      );
      return true;
    }
  );
});

test('returns all materials via findAll', async () => {
  const list = [{ _id: ids.matiere, ...validData }];
  stub(MatiereRepository, 'findAll', async () => list);

  const result = await MatiereService.findAll();
  assert.deepEqual(result, list);
});

test('returns a material by id', async () => {
  const item = { _id: ids.matiere, ...validData };
  stub(MatiereRepository, 'findById', async () => item);

  const result = await MatiereService.findById(ids.matiere);
  assert.deepEqual(result, item);
});

test('rejects malformed ObjectId on findById', async () => {
  await assert.rejects(
    () => MatiereService.findById('invalid-id'),
    (error) => {
      expectServiceError(error, 400, 'id must be a valid MongoDB ObjectId');
      return true;
    }
  );
});

test('throws 404 on findById when material does not exist', async () => {
  stub(MatiereRepository, 'findById', async () => null);

  await assert.rejects(
    () => MatiereService.findById(ids.matiere),
    (error) => {
      expectServiceError(error, 404, 'Matiere not found');
      return true;
    }
  );
});

test('updates a material using allowed fields', async () => {
  const existing = { _id: ids.matiere, ...validData };
  const updated = { ...existing, nom: 'Acier Trempe', seuilAlerte: 75 };

  stub(MatiereRepository, 'findById', async () => existing);
  stub(MatiereRepository, 'updateById', async (_id, updateData) => {
    assert.deepEqual(updateData, { nom: 'Acier Trempe', seuilAlerte: 75 });
    return updated;
  });

  const result = await MatiereService.update(ids.matiere, {
    nom: '  Acier Trempe  ',
    seuilAlerte: 75,
  });

  assert.deepEqual(result, updated);
});

test('rejects an empty update object', async () => {
  await assert.rejects(
    () => MatiereService.update(ids.matiere, {}),
    (error) => {
      expectServiceError(
        error,
        400,
        'At least one material field must be provided for update'
      );
      return true;
    }
  );
});

test('rejects unsupported update fields', async () => {
  await assert.rejects(
    () => MatiereService.update(ids.matiere, { unknown: 'field' }),
    (error) => {
      expectServiceError(error, 400, 'Unsupported material field(s): unknown');
      return true;
    }
  );
});

test('rejects update when material does not exist', async () => {
  stub(MatiereRepository, 'findById', async () => null);

  await assert.rejects(
    () => MatiereService.update(ids.matiere, { nom: 'Nouveau' }),
    (error) => {
      expectServiceError(error, 404, 'Matiere not found');
      return true;
    }
  );
});

test('rejects update that would duplicate an existing reference on another material', async () => {
  const existing = { _id: ids.matiere, ...validData };
  stub(MatiereRepository, 'findById', async () => existing);
  stub(MatiereRepository, 'findByReference', async () => ({
    _id: ids.matiere2,
    reference: 'MAT-002',
  }));

  await assert.rejects(
    () => MatiereService.update(ids.matiere, { reference: 'MAT-002' }),
    (error) => {
      expectServiceError(
        error,
        409,
        'A material with this reference already exists'
      );
      return true;
    }
  );
});

test('maps a duplicate-key error during update to a conflict', async () => {
  const existing = { _id: ids.matiere, ...validData };
  stub(MatiereRepository, 'findById', async () => existing);
  stub(MatiereRepository, 'findByReference', async () => null);
  stub(MatiereRepository, 'updateById', async () => {
    const error = new Error('E11000 duplicate key');
    error.code = 11000;
    throw error;
  });

  await assert.rejects(
    () => MatiereService.update(ids.matiere, { reference: 'MAT-999' }),
    (error) => {
      expectServiceError(
        error,
        409,
        'A material with this reference already exists'
      );
      return true;
    }
  );
});

test('deletes an existing material successfully when unreferenced', async () => {
  const existing = { _id: ids.matiere, ...validData };
  stub(MatiereRepository, 'findById', async () => existing);
  stub(CompositionProduit, 'findOne', async () => null);
  stub(LotStock, 'findOne', async () => null);
  stub(MatiereRepository, 'deleteById', async () => existing);

  const result = await MatiereService.delete(ids.matiere);
  assert.deepEqual(result, existing);
});

test('rejects deletion when material does not exist', async () => {
  stub(MatiereRepository, 'findById', async () => null);

  await assert.rejects(
    () => MatiereService.delete(ids.matiere),
    (error) => {
      expectServiceError(error, 404, 'Matiere not found');
      return true;
    }
  );
});

test('rejects deletion when material is referenced by CompositionProduit', async () => {
  const existing = { _id: ids.matiere, ...validData };
  stub(MatiereRepository, 'findById', async () => existing);
  stub(CompositionProduit, 'findOne', async () => ({ _id: ids.composition }));

  await assert.rejects(
    () => MatiereService.delete(ids.matiere),
    (error) => {
      expectServiceError(
        error,
        409,
        'Cannot delete material: referenced in product compositions'
      );
      return true;
    }
  );
});

test('rejects deletion when material is referenced by LotStock', async () => {
  const existing = { _id: ids.matiere, ...validData };
  stub(MatiereRepository, 'findById', async () => existing);
  stub(CompositionProduit, 'findOne', async () => null);
  stub(LotStock, 'findOne', async () => ({ _id: ids.lot }));

  await assert.rejects(
    () => MatiereService.delete(ids.matiere),
    (error) => {
      expectServiceError(
        error,
        409,
        'Cannot delete material: referenced in stock lots'
      );
      return true;
    }
  );
});
