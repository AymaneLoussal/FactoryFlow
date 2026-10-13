const test = require('node:test');
const assert = require('node:assert/strict');

const Produit = require('../../src/models/Produit');
const Matiere = require('../../src/models/Matiere');
const CompositionRepository = require('../../src/repositories/CompositionRepository');
const CompositionService = require('../../src/services/CompositionService');

const ids = {
  produit: '64a1b2c3d4e5f60718293041',
  produit2: '64a1b2c3d4e5f60718293042',
  matiere: '64a1b2c3d4e5f60718293051',
  matiere2: '64a1b2c3d4e5f60718293052',
  composition: '64a1b2c3d4e5f60718293061',
  composition2: '64a1b2c3d4e5f60718293062',
};

const validData = {
  produit: ids.produit,
  matiere: ids.matiere,
  quantiteUnitaire: 3,
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

function stubExistingReferences() {
  stub(Produit, 'findById', async () => ({ _id: ids.produit }));
  stub(Matiere, 'findById', async () => ({ _id: ids.matiere }));
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

test('creates a composition successfully', async () => {
  stubExistingReferences();
  const created = { _id: ids.composition, ...validData };
  let receivedData;

  stub(CompositionRepository, 'findByProductAndMaterial', async () => null);
  stub(CompositionRepository, 'create', async (data) => {
    receivedData = data;
    return created;
  });

  assert.equal(await CompositionService.create(validData), created);
  assert.deepEqual(receivedData, validData);
});

test('rejects missing required composition fields', async () => {
  const cases = [
    { matiere: ids.matiere, quantiteUnitaire: 3 },
    { produit: ids.produit, quantiteUnitaire: 3 },
    { produit: ids.produit, matiere: ids.matiere },
  ];

  for (const data of cases) {
    await assert.rejects(
      CompositionService.create(data),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.equal(
          error.message,
          'produit, matiere, and quantiteUnitaire are required'
        );
        return true;
      }
    );
  }
});

test('rejects a malformed product ObjectId during creation', async () => {
  await assert.rejects(
    CompositionService.create({ ...validData, produit: 'not-an-object-id' }),
    (error) => {
      expectServiceError(error, 400, 'produit must be a valid MongoDB ObjectId');
      return true;
    }
  );
});

test('rejects a malformed material ObjectId during creation', async () => {
  await assert.rejects(
    CompositionService.create({ ...validData, matiere: 'not-an-object-id' }),
    (error) => {
      expectServiceError(error, 400, 'matiere must be a valid MongoDB ObjectId');
      return true;
    }
  );
});

test('rejects creation when the product does not exist', async () => {
  stub(Produit, 'findById', async () => null);
  stub(Matiere, 'findById', async () => ({ _id: ids.matiere }));

  await assert.rejects(CompositionService.create(validData), (error) => {
    expectServiceError(error, 404, 'Produit not found');
    return true;
  });
});

test('rejects creation when the material does not exist', async () => {
  stub(Produit, 'findById', async () => ({ _id: ids.produit }));
  stub(Matiere, 'findById', async () => null);

  await assert.rejects(CompositionService.create(validData), (error) => {
    expectServiceError(error, 404, 'Matiere not found');
    return true;
  });
});

for (const [label, quantity] of [
  ['zero', 0],
  ['negative', -2],
  ['NaN', Number.NaN],
  ['infinity', Number.POSITIVE_INFINITY],
]) {
  test(`rejects a ${label} composition quantity`, async () => {
    await assert.rejects(
      CompositionService.create({ ...validData, quantiteUnitaire: quantity }),
      (error) => {
        expectServiceError(
          error,
          400,
          'quantiteUnitaire must be a finite number greater than 0'
        );
        return true;
      }
    );
  });
}

test('rejects creation of a duplicate product/material pair', async () => {
  stubExistingReferences();
  stub(CompositionRepository, 'findByProductAndMaterial', async () => ({
    _id: ids.composition,
  }));

  await assert.rejects(CompositionService.create(validData), (error) => {
    expectServiceError(
      error,
      409,
      'A composition already exists for this product and material'
    );
    return true;
  });
});

test('maps a duplicate-key error during creation to a conflict', async () => {
  stubExistingReferences();
  stub(CompositionRepository, 'findByProductAndMaterial', async () => null);
  stub(CompositionRepository, 'create', async () => {
    const error = new Error('duplicate key');
    error.code = 11000;
    throw error;
  });

  await assert.rejects(CompositionService.create(validData), (error) => {
    expectServiceError(
      error,
      409,
      'A composition already exists for this product and material'
    );
    return true;
  });
});

test('returns a product composition lookup after verifying the product exists', async () => {
  stub(Produit, 'findById', async () => ({ _id: ids.produit }));
  const compositions = [{ _id: ids.composition }, { _id: ids.composition2 }];
  let queriedProductId;
  stub(CompositionRepository, 'findByProduct', async (produitId) => {
    queriedProductId = produitId;
    return compositions;
  });

  assert.equal(await CompositionService.findByProduct(ids.produit), compositions);
  assert.equal(queriedProductId, ids.produit);
});

test('updates a composition using allowed fields', async () => {
  const existing = {
    _id: ids.composition,
    produit: ids.produit,
    matiere: ids.matiere,
    quantiteUnitaire: 3,
  };
  const updated = { ...existing, quantiteUnitaire: 4 };
  let receivedUpdate;

  stub(CompositionRepository, 'findById', async () => existing);
  stub(CompositionRepository, 'updateById', async (id, data) => {
    assert.equal(id, ids.composition);
    receivedUpdate = data;
    return updated;
  });

  assert.equal(
    await CompositionService.update(ids.composition, { quantiteUnitaire: 4 }),
    updated
  );
  assert.deepEqual(receivedUpdate, { quantiteUnitaire: 4 });
});

test('rejects an empty update object', async () => {
  await assert.rejects(CompositionService.update(ids.composition, {}), (error) => {
    expectServiceError(
      error,
      400,
      'At least one composition field must be provided for update'
    );
    return true;
  });
});

test('rejects unsupported update fields', async () => {
  await assert.rejects(
    CompositionService.update(ids.composition, { unexpected: true }),
    (error) => {
      expectServiceError(error, 400, 'Unsupported composition field(s): unexpected');
      return true;
    }
  );
});

test('rejects update when the composition does not exist', async () => {
  stub(CompositionRepository, 'findById', async () => null);

  await assert.rejects(
    CompositionService.update(ids.composition, { quantiteUnitaire: 4 }),
    (error) => {
      expectServiceError(error, 404, 'Composition not found');
      return true;
    }
  );
});

test('rejects an update that would duplicate a product/material pair', async () => {
  const existing = {
    _id: ids.composition,
    produit: ids.produit,
    matiere: ids.matiere,
    quantiteUnitaire: 3,
  };
  stub(CompositionRepository, 'findById', async () => existing);
  stub(Matiere, 'findById', async () => ({ _id: ids.matiere2 }));
  stub(CompositionRepository, 'findByProductAndMaterial', async () => ({
    _id: ids.composition2,
  }));

  await assert.rejects(
    CompositionService.update(ids.composition, { matiere: ids.matiere2 }),
    (error) => {
      expectServiceError(
        error,
        409,
        'A composition already exists for this product and material'
      );
      return true;
    }
  );
});

test('maps a duplicate-key error during update to a conflict', async () => {
  const existing = {
    _id: ids.composition,
    produit: ids.produit,
    matiere: ids.matiere,
    quantiteUnitaire: 3,
  };
  stub(CompositionRepository, 'findById', async () => existing);
  stub(CompositionRepository, 'updateById', async () => {
    const error = new Error('duplicate key');
    error.code = 11000;
    throw error;
  });

  await assert.rejects(
    CompositionService.update(ids.composition, { quantiteUnitaire: 4 }),
    (error) => {
      expectServiceError(
        error,
        409,
        'A composition already exists for this product and material'
      );
      return true;
    }
  );
});

test('deletes an existing composition successfully', async () => {
  const composition = { _id: ids.composition };
  let deletedId;
  stub(CompositionRepository, 'findById', async () => composition);
  stub(CompositionRepository, 'deleteById', async (id) => {
    deletedId = id;
    return composition;
  });

  assert.equal(await CompositionService.delete(ids.composition), composition);
  assert.equal(deletedId, ids.composition);
});

test('rejects deletion when the composition does not exist', async () => {
  stub(CompositionRepository, 'findById', async () => null);

  await assert.rejects(CompositionService.delete(ids.composition), (error) => {
    expectServiceError(error, 404, 'Composition not found');
    return true;
  });
});
