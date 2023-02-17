import chai from 'chai';
import chaiHttp from 'chai-http';

import { app } from '..';

chai.use(chaiHttp);

describe('API Service test', () => {
    it('Hello, World!', (done) => {
        chai.request(app)
            .get('/')
            .end((err, res) => {
                chai.assert.equal(res.status, 200);
                chai.assert.deepEqual(res.body, {"Hello": "World"});
                chai.assert.equal(res.text, '{"Hello":"World"}');
                done();
            });
    })
})
